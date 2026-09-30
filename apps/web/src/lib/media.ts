import { createHash, randomUUID } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import { mkdir, rename, rm, statfs, writeFile } from "node:fs/promises";
import { createDatabaseClient, type DatabaseQuery } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";
import { canAcceptUpload } from "@baixada/core/media/storage-policy";

const extensionsByMime = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
} as const;

type AllowedMimeType = keyof typeof extensionsByMime;

export type MediaAssetSummary = {
  id: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  processingStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  createdAt: Date;
};

function mediaRoot() {
  return resolve(process.env.MEDIA_ROOT ?? "./uploads");
}

async function diskUsedPercent(root: string) {
  await mkdir(root, { recursive: true });
  const stats = await statfs(root);
  if (!stats.blocks) return 100;
  return ((stats.blocks - stats.bavail) / stats.blocks) * 100;
}

function hasExpectedSignature(mimeType: AllowedMimeType, bytes: Buffer) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (bytes.length < 12 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
  return ["heic", "heix", "hevc", "hevx", "mif1"].includes(brand);
}

async function inTenant<T>(tenantId: string, userId: string, work: (tx: DatabaseQuery) => Promise<T>) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      return work(tx);
    });
  } finally {
    await sql.end();
  }
}

export async function listTenantMedia(tenantId: string, userId: string): Promise<MediaAssetSummary[]> {
  return inTenant(tenantId, userId, async (tx) => tx<MediaAssetSummary[]>`
    select id, original_filename as "originalFilename", mime_type as "mimeType", byte_size as "byteSize",
      processing_status as "processingStatus", created_at as "createdAt"
    from media_assets
    where tenant_id = ${tenantId} and deleted_at is null
    order by created_at desc, id desc
    limit 30
  `);
}

export async function receiveMediaUpload(tenantId: string, actorUserId: string, file: File) {
  if (!file || !file.name) throw new Error("Escolha uma imagem para enviar.");
  const mimeType = file.type as AllowedMimeType;
  const root = mediaRoot();
  const policy = canAcceptUpload({ mimeType, byteSize: file.size, diskUsedPercent: await diskUsedPercent(root) });
  if (!policy.allowed) {
    if (policy.reason === "DISK_HEADROOM") throw new Error("Os uploads foram bloqueados porque o armazenamento atingiu o limite preventivo de 80%.");
    if (policy.reason === "FILE_TOO_LARGE") throw new Error("O arquivo original pode ter no máximo 25 MB.");
    throw new Error("Envie uma imagem JPEG, PNG, WebP ou HEIC.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedSignature(mimeType, bytes)) throw new Error("O conteúdo do arquivo não corresponde ao formato informado.");

  const assetId = randomUUID();
  const extension = extensionsByMime[mimeType] ?? extname(file.name).toLowerCase();
  const logicalPath = join("tenants", tenantId, "temporary", `${assetId}${extension}`);
  const finalPath = join(root, logicalPath);
  const temporaryPath = `${finalPath}.uploading`;
  await mkdir(join(root, "tenants", tenantId, "temporary"), { recursive: true });
  await writeFile(temporaryPath, bytes, { flag: "wx" });
  await rename(temporaryPath, finalPath);

  try {
    await inTenant(tenantId, actorUserId, async (tx) => {
      await tx`
        insert into media_assets (id, tenant_id, asset_stage, object_path, original_filename, mime_type, byte_size, sha256, uploaded_by)
        values (${assetId}, ${tenantId}, 'TEMPORARY_ORIGINAL', ${logicalPath}, ${basename(file.name)}, ${mimeType}, ${bytes.byteLength}, ${createHash("sha256").update(bytes).digest("hex")}, ${actorUserId})
      `;
      await tx`
        insert into media_processing_jobs (id, tenant_id, media_id, idempotency_key, job_type)
        values (${randomUUID()}, ${tenantId}, ${assetId}, ${`media:${assetId}:variants:v1`}, 'GENERATE_VARIANTS')
      `;
      await tx`
        insert into storage_usage_events (id, tenant_id, media_id, delta_bytes, reason)
        values (${randomUUID()}, ${tenantId}, ${assetId}, ${bytes.byteLength}, 'TEMPORARY_ORIGINAL_CREATED')
      `;
      await tx`
        insert into tenant_usage_counters (tenant_id, storage_bytes, calculated_at)
        values (${tenantId}, ${bytes.byteLength}, now())
        on conflict (tenant_id) do update set storage_bytes = tenant_usage_counters.storage_bytes + excluded.storage_bytes, calculated_at = now()
      `;
      await tx`
        insert into outbox_events (id, tenant_id, event_type, aggregate_type, aggregate_id, payload)
        values (${randomUUID()}, ${tenantId}, 'MEDIA_PROCESSING_REQUESTED', 'MEDIA_ASSET', ${assetId}, ${tx.json({ mediaId: assetId, jobType: "GENERATE_VARIANTS" })})
      `;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'MEDIA_UPLOAD_RECEIVED', 'MEDIA_ASSET', ${assetId}, ${randomUUID()}, ${tx.json({ mimeType, byteSize: bytes.byteLength })})
      `;
    });
  } catch (error) {
    await rm(finalPath, { force: true });
    throw error;
  }
  return assetId;
}
