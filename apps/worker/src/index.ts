import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import postgres from "postgres";
import sharp from "sharp";
import { processPlatformOperations } from "./platform-operations.js";
import { setSystemRlsContext } from "./rls-context.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 4, idle_timeout: 20 });
const mediaRoot = resolve(process.env.MEDIA_ROOT ?? "./uploads");
const requiredVariants = [
  { code: "thumb", width: 320 },
  { code: "medium", width: 960 },
  { code: "large", width: 1920 },
] as const;
let stopping = false;
let lastPlatformOperationsAt = 0;
const platformOperationsIntervalMs = 15 * 60 * 1000;

type MediaJob = { id: string; tenantId: string; mediaId: string; objectPath: string; originalByteSize: number };
type ProcessedVariant = { code: (typeof requiredVariants)[number]["code"]; objectPath: string; byteSize: number; width: number; height: number };

async function inSystemTransaction<T>(work: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await setSystemRlsContext(tx);
    return work(tx);
  });
}

async function claimMediaJob(): Promise<MediaJob | null> {
  return inSystemTransaction(async (tx) => {
    const jobs = await tx<MediaJob[]>`
      select job.id, job.tenant_id as "tenantId", job.media_id as "mediaId", asset.object_path as "objectPath", asset.byte_size as "originalByteSize"
      from media_processing_jobs job join media_assets asset on asset.id = job.media_id and asset.tenant_id = job.tenant_id
      where job.status in ('PENDING', 'FAILED') and job.available_at <= now() and job.attempts < 5 and asset.processing_status in ('PENDING', 'FAILED')
      order by job.available_at, job.id for update of job skip locked limit 1
    `;
    const job = jobs[0];
    if (!job) return null;
    await tx`update media_processing_jobs set status = 'RUNNING', attempts = attempts + 1, started_at = now(), last_error = null where id = ${job.id} and tenant_id = ${job.tenantId}`;
    await tx`update media_assets set processing_status = 'PROCESSING', updated_at = now() where id = ${job.mediaId} and tenant_id = ${job.tenantId}`;
    return job;
  });
}

async function generateVariants(job: MediaJob): Promise<ProcessedVariant[]> {
  const originalPath = join(mediaRoot, job.objectPath);
  const variants: ProcessedVariant[] = [];
  for (const variant of requiredVariants) {
    const objectPath = join("tenants", job.tenantId, "derived", job.mediaId, `${variant.code}.webp`);
    const finalPath = join(mediaRoot, objectPath);
    const temporaryPath = `${finalPath}.processing`;
    await mkdir(dirname(finalPath), { recursive: true });
    await sharp(originalPath, { limitInputPixels: 40_000_000, failOn: "error" }).rotate().resize({ width: variant.width, withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toFile(temporaryPath);
    const metadata = await sharp(temporaryPath).metadata();
    if (!metadata.width || !metadata.height) {
      await rm(temporaryPath, { force: true });
      throw new Error(`A variante ${variant.code} não pôde ser validada.`);
    }
    const output = await stat(temporaryPath);
    await rename(temporaryPath, finalPath);
    variants.push({ code: variant.code, objectPath, byteSize: output.size, width: metadata.width, height: metadata.height });
  }
  return variants;
}

async function recordProcessedVariants(job: MediaJob, variants: ProcessedVariant[]) {
  await inSystemTransaction(async (tx) => {
    for (const variant of variants) {
      const inserted = await tx<{ id: string }[]>`
        insert into media_variants (id, tenant_id, media_id, variant_code, object_path, mime_type, byte_size, width, height, processing_status)
        values (${randomUUID()}, ${job.tenantId}, ${job.mediaId}, ${variant.code}, ${variant.objectPath}, 'image/webp', ${variant.byteSize}, ${variant.width}, ${variant.height}, 'READY')
        on conflict (media_id, variant_code) do nothing returning id
      `;
      if (inserted[0]) {
        await tx`insert into storage_usage_events (id, tenant_id, media_id, delta_bytes, reason) values (${randomUUID()}, ${job.tenantId}, ${job.mediaId}, ${variant.byteSize}, ${`DERIVED_${variant.code.toUpperCase()}_CREATED`})`;
        await tx`update tenant_usage_counters set storage_bytes = storage_bytes + ${variant.byteSize}, calculated_at = now() where tenant_id = ${job.tenantId}`;
      }
    }
    const complete = await tx<{ count: number }[]>`select count(*)::integer as count from media_variants where tenant_id = ${job.tenantId} and media_id = ${job.mediaId} and processing_status = 'READY'`;
    if (complete[0]?.count !== requiredVariants.length) throw new Error("As variantes obrigatórias ainda não estão completas.");
    await tx`update media_assets set processing_status = 'READY', updated_at = now() where id = ${job.mediaId} and tenant_id = ${job.tenantId}`;
    await tx`update media_processing_jobs set status = 'SUCCEEDED', finished_at = now() where id = ${job.id} and tenant_id = ${job.tenantId}`;
    await tx`insert into audit_events (id, tenant_id, actor_type, action, resource_type, resource_id, request_id, after_data) values (${randomUUID()}, ${job.tenantId}, 'SYSTEM', 'MEDIA_VARIANTS_READY', 'MEDIA_ASSET', ${job.mediaId}, ${randomUUID()}, ${tx.json({ variants: variants.map((variant) => variant.code) })})`;
  });
}

async function discardOriginalAfterSuccess(job: MediaJob, variants: ProcessedVariant[]) {
  const originalPath = join(mediaRoot, job.objectPath);
  try { await rm(originalPath); } catch (error) { console.warn(JSON.stringify({ message: "original retained for later cleanup", mediaId: job.mediaId, error: String(error) })); return; }
  const large = variants.find((variant) => variant.code === "large");
  if (!large) return;
  await inSystemTransaction(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      update media_assets set asset_stage = 'DERIVED', object_path = ${large.objectPath}, mime_type = 'image/webp', byte_size = ${large.byteSize}, width = ${large.width}, height = ${large.height}, updated_at = now()
      where id = ${job.mediaId} and tenant_id = ${job.tenantId} and asset_stage = 'TEMPORARY_ORIGINAL' and processing_status = 'READY' returning id
    `;
    if (!updated[0]) return;
    await tx`insert into storage_usage_events (id, tenant_id, media_id, delta_bytes, reason) values (${randomUUID()}, ${job.tenantId}, ${job.mediaId}, ${-job.originalByteSize}, 'TEMPORARY_ORIGINAL_DISCARDED')`;
    await tx`update tenant_usage_counters set storage_bytes = greatest(0, storage_bytes - ${job.originalByteSize}), calculated_at = now() where tenant_id = ${job.tenantId}`;
    await tx`insert into audit_events (id, tenant_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${job.tenantId}, 'SYSTEM', 'TEMPORARY_ORIGINAL_DISCARDED', 'MEDIA_ASSET', ${job.mediaId}, ${randomUUID()})`;
  });
}

async function failMediaJob(job: MediaJob, error: unknown) {
  await inSystemTransaction(async (tx) => {
    const message = String(error).slice(0, 2000);
    await tx`update media_processing_jobs set status = 'FAILED', available_at = now() + interval '5 minutes', finished_at = now(), last_error = ${message} where id = ${job.id} and tenant_id = ${job.tenantId}`;
    await tx`update media_assets set processing_status = 'FAILED', updated_at = now() where id = ${job.mediaId} and tenant_id = ${job.tenantId}`;
  });
}

async function processMediaJobs() {
  for (let index = 0; index < 5; index += 1) {
    const job = await claimMediaJob();
    if (!job) return;
    try {
      const variants = await generateVariants(job);
      await recordProcessedVariants(job, variants);
      await discardOriginalAfterSuccess(job, variants);
      console.info(JSON.stringify({ message: "media processed", mediaId: job.mediaId }));
    } catch (error) {
      await failMediaJob(job, error);
      console.error(JSON.stringify({ message: "media processing failed", mediaId: job.mediaId, error: String(error) }));
    }
  }
}

type OutboxEvent = { id: string; event_type: string; aggregate_id: string | null; payload: Record<string, string>; attempts: number };
const emailEventTypes = new Set(["PASSWORD_RESET_REQUESTED", "GUARDIAN_CONFIRMATION_REQUESTED", "ADMIN_INVITATION_REQUESTED"]);

function emailTransportReady() {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "resend") return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return provider === "console" && process.env.NODE_ENV !== "production";
}

function emailForOutbox(event: OutboxEvent) {
  const payload = event.payload;
  if (event.event_type === "PASSWORD_RESET_REQUESTED") return {
    to: payload.email!, subject: "Redefina sua senha — Baixada Futsal Clube",
    text: `Olá${payload.displayName ? `, ${payload.displayName}` : ""}.\n\nRecebemos uma solicitação para redefinir a senha da sua conta. Use este link, válido por 30 minutos e uma única vez:\n${payload.url}\n\nSe você não solicitou a redefinição, ignore esta mensagem.`,
  };
  if (event.event_type === "GUARDIAN_CONFIRMATION_REQUESTED") return {
    to: payload.email!, subject: "Confirmação de responsável — Baixada Futsal Clube",
    text: `Olá${payload.guardianName ? `, ${payload.guardianName}` : ""}.\n\nConfirme o cadastro de ${payload.displayName ?? "um participante menor de idade"} neste link, válido por 7 dias:\n${payload.url}\n\nSe você não reconhece esta solicitação, ignore esta mensagem.`,
  };
  if (event.event_type === "ADMIN_INVITATION_REQUESTED") return {
    to: payload.email!, subject: "Convite administrativo — Baixada Futsal Clube",
    text: `Olá${payload.inviteeName ? `, ${payload.inviteeName}` : ""}.\n\nVocê foi convidado para administrar ${payload.tenantName ?? "um clube"}. Aceite o convite neste link, válido por 7 dias:\n${payload.url}\n\nO acesso administrativo exigirá a configuração de autenticação em duas etapas.`,
  };
  return null;
}

async function sendOutboxEmail(event: OutboxEvent) {
  const message = emailForOutbox(event);
  if (!message) throw new Error("Modelo de e-mail transacional desconhecido.");
  if ((process.env.EMAIL_PROVIDER ?? "console") === "console") {
    // Console transport is deliberately local-only: reset/invitation links are bearer credentials.
    console.info(JSON.stringify({ message: "development email", eventId: event.id, ...message }));
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": event.id },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      to: [message.to], subject: message.subject, text: message.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Resend recusou a mensagem (${response.status}).`);
}

async function claimOutboxEvent(): Promise<OutboxEvent | null> {
  return inSystemTransaction(async (tx) => {
    const events = await tx<OutboxEvent[]>`
      select id, event_type, aggregate_id, payload, attempts
      from outbox_events
      where processed_at is null and dead_lettered_at is null and available_at <= now() and attempts < 5
        and (processing_started_at is null or processing_started_at < now() - interval '15 minutes')
        and (event_type = 'MEDIA_PROCESSING_REQUESTED' or
          (event_type in ('PASSWORD_RESET_REQUESTED', 'GUARDIAN_CONFIRMATION_REQUESTED', 'ADMIN_INVITATION_REQUESTED') and ${emailTransportReady()}))
      order by available_at, id for update skip locked limit 1
    `;
    const event = events[0];
    if (!event) return null;
    await tx`update outbox_events set processing_started_at = now(), attempts = attempts + 1 where id = ${event.id}`;
    return { ...event, attempts: event.attempts + 1 };
  });
}

async function redactInactiveEmailOutboxEvents() {
  await inSystemTransaction((tx) => tx`
    update outbox_events event
    set processed_at = now(), dead_lettered_at = now(), processing_started_at = null,
      last_error = 'Credencial de uso único revogada, consumida ou expirada.', payload = '{"redacted":true}'::jsonb
    where event.processed_at is null and event.dead_lettered_at is null and event.event_type in (
      'PASSWORD_RESET_REQUESTED', 'GUARDIAN_CONFIRMATION_REQUESTED', 'ADMIN_INVITATION_REQUESTED'
    ) and (
      (event.event_type = 'PASSWORD_RESET_REQUESTED' and not exists (
        select 1 from password_reset_tokens token where token.user_id = event.aggregate_id
          and token.token_hash = event.payload->>'tokenHash' and token.consumed_at is null and token.expires_at > now()
      )) or
      (event.event_type = 'GUARDIAN_CONFIRMATION_REQUESTED' and not exists (
        select 1 from guardian_confirmations confirmation where confirmation.id = event.aggregate_id
          and confirmation.token_hash = event.payload->>'tokenHash' and confirmation.status = 'PENDING' and confirmation.expires_at > now()
      )) or
      (event.event_type = 'ADMIN_INVITATION_REQUESTED' and not exists (
        select 1 from tenant_admin_invitations invitation where invitation.id = event.aggregate_id
          and invitation.token_hash = event.payload->>'tokenHash' and invitation.status = 'PENDING' and invitation.expires_at > now()
      ))
    )
  `);
}

async function processOutbox() {
  await redactInactiveEmailOutboxEvents();
  for (let index = 0; index < 10; index += 1) {
    const event = await claimOutboxEvent();
    if (!event) return;
    try {
      if (emailEventTypes.has(event.event_type)) {
        const aggregateId = event.aggregate_id;
        const tokenHash = event.payload.tokenHash;
        if (!aggregateId || !tokenHash) throw new Error("Evento transacional incompleto; token verificador ausente.");
        const active = await inSystemTransaction(async (tx) => {
          if (event.event_type === "PASSWORD_RESET_REQUESTED") {
            const rows = await tx<{ active: boolean }[]>`select exists(select 1 from password_reset_tokens where user_id = ${aggregateId} and token_hash = ${tokenHash} and consumed_at is null and expires_at > now()) as active`;
            return rows[0]?.active ?? false;
          }
          if (event.event_type === "GUARDIAN_CONFIRMATION_REQUESTED") {
            const rows = await tx<{ active: boolean }[]>`select exists(select 1 from guardian_confirmations where id = ${aggregateId} and token_hash = ${tokenHash} and status = 'PENDING' and expires_at > now()) as active`;
            return rows[0]?.active ?? false;
          }
          const rows = await tx<{ active: boolean }[]>`select exists(select 1 from tenant_admin_invitations where id = ${aggregateId} and token_hash = ${tokenHash} and status = 'PENDING' and expires_at > now()) as active`;
          return rows[0]?.active ?? false;
        });
        if (active) await sendOutboxEmail(event);
      }
      else if (event.event_type !== "MEDIA_PROCESSING_REQUESTED") throw new Error("Evento de outbox sem processador.");
      await inSystemTransaction((tx) => tx`
        update outbox_events
        set processed_at = now(), processing_started_at = null, last_error = null,
          payload = case when event_type in ('PASSWORD_RESET_REQUESTED', 'GUARDIAN_CONFIRMATION_REQUESTED', 'ADMIN_INVITATION_REQUESTED') then '{"redacted":true}'::jsonb else payload end
        where id = ${event.id} and processed_at is null
      `);
    } catch (error) {
      const retryMinutes = Math.min(60, 2 ** event.attempts);
      const failure = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida no processador de outbox.";
      await inSystemTransaction((tx) => tx`
        update outbox_events
        set processing_started_at = null, last_error = ${failure},
          available_at = now() + (${retryMinutes}::text || ' minutes')::interval,
          dead_lettered_at = case when ${event.attempts} >= 5 then now() else null end,
          payload = case when ${event.attempts} >= 5 and event_type in ('PASSWORD_RESET_REQUESTED', 'GUARDIAN_CONFIRMATION_REQUESTED', 'ADMIN_INVITATION_REQUESTED') then '{"redacted":true}'::jsonb else payload end
        where id = ${event.id} and processed_at is null
      `);
      console.error(JSON.stringify({ message: "outbox delivery failed", eventId: event.id, eventType: event.event_type, attempt: event.attempts, error: failure }));
    }
  }
}

type EmailDelivery = { id: string; tenantId: string; notificationId: string; email: string; title: string; body: string; attempts: number };

async function claimEmailDelivery(): Promise<EmailDelivery | null> {
  return inSystemTransaction(async (tx) => {
    await tx`update notification_deliveries
      set status = 'FAILED', processing_started_at = null,
        last_error = coalesce(last_error, 'Worker interrompido durante a entrega; limite de tentativas atingido.')
      where channel = 'EMAIL' and status = 'PROCESSING' and attempts >= 5
        and processing_started_at < now() - interval '15 minutes'`;
    const rows = await tx<EmailDelivery[]>`
      select delivery.id, delivery.tenant_id as "tenantId", delivery.notification_id as "notificationId",
        user_account.email, notification.payload->>'title' as title, notification.payload->>'body' as body, delivery.attempts
      from notification_deliveries delivery
      join notifications notification on notification.tenant_id = delivery.tenant_id and notification.id = delivery.notification_id
      join users user_account on user_account.id = notification.recipient_user_id
      where delivery.channel = 'EMAIL'
        and ((delivery.status in ('PENDING', 'FAILED') and delivery.available_at <= now())
          or (delivery.status = 'PROCESSING' and delivery.processing_started_at < now() - interval '15 minutes'))
        and delivery.attempts < 5 and user_account.global_status = 'ACTIVE'
      order by delivery.available_at, delivery.id
      for update of delivery skip locked limit 1
    `;
    const delivery = rows[0];
    if (!delivery) return null;
    await tx`update notification_deliveries set status = 'PROCESSING', processing_started_at = now(), attempts = attempts + 1 where id = ${delivery.id} and tenant_id = ${delivery.tenantId}`;
    return { ...delivery, attempts: delivery.attempts + 1 };
  });
}

async function processEmailDeliveries() {
  if ((process.env.EMAIL_PROVIDER ?? "console") !== "resend") return;
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.EMAIL_FROM;
  if (!apiKey || !sender) return;
  for (let index = 0; index < 10; index += 1) {
    const delivery = await claimEmailDelivery();
    if (!delivery) return;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": delivery.id },
        body: JSON.stringify({
          from: sender,
          ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
          to: [delivery.email], subject: delivery.title || "Aviso do Baixada Futsal Clube", text: delivery.body || "Há uma nova notificação administrativa no painel.",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Provedor recusou a mensagem (${response.status}): ${(await response.text()).slice(0, 1000)}`);
      await inSystemTransaction((tx) => tx`update notification_deliveries set status = 'SENT', processing_started_at = null, delivered_at = now(), last_error = null where id = ${delivery.id} and tenant_id = ${delivery.tenantId} and status = 'PROCESSING'`);
      console.info(JSON.stringify({ message: "administrative email sent", deliveryId: delivery.id, notificationId: delivery.notificationId }));
    } catch (error) {
      const failure = String(error).slice(0, 2000);
      const delayMinutes = Math.min(60, 2 ** delivery.attempts);
      await inSystemTransaction((tx) => tx`update notification_deliveries set status = 'FAILED', processing_started_at = null, last_error = ${failure}, available_at = now() + (${delayMinutes}::text || ' minutes')::interval where id = ${delivery.id} and tenant_id = ${delivery.tenantId} and status = 'PROCESSING'`);
      console.error(JSON.stringify({ message: "administrative email delivery failed", deliveryId: delivery.id, attempts: delivery.attempts, error: failure }));
    }
  }
}

async function run() {
  console.info(JSON.stringify({ message: "baixada worker started" }));
  while (!stopping) {
    await processMediaJobs();
    await processEmailDeliveries();
    await processOutbox();
    if (Date.now() - lastPlatformOperationsAt >= platformOperationsIntervalMs) {
      lastPlatformOperationsAt = Date.now();
      try { await processPlatformOperations(sql); }
      catch (error) { console.error(JSON.stringify({ message: "platform operations reconciliation failed", error: String(error) })); }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await sql.end();
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
void run();
