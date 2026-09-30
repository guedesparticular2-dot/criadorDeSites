import { randomUUID } from "node:crypto";
import { createDatabaseClient, type DatabaseQuery } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";

export type ContentItem = {
  id: string;
  contentType: "NEWS" | "EVENT" | "MATCH" | "POLL" | "NOTICE" | "HIGHLIGHT" | "GALLERY";
  title: string;
  slug: string;
  summary: string | null;
  body: { paragraphs?: string[] };
  editorialStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "TRASH";
  visibility: "PUBLIC" | "RESTRICTED" | "HIDDEN";
  version: number;
  updatedAt: Date;
};

export type PublishedContent = Pick<ContentItem, "id" | "contentType" | "title" | "slug" | "summary" | "body" | "version"> & {
  publishedAt: Date | null;
  authorDisplay: string | null;
  commentsEnabled: boolean;
};

function makeSlug(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3) throw new Error("O título precisa gerar uma URL com pelo menos três caracteres.");
  return slug.slice(0, 120);
}

function cleanText(value: string, label: string, maximum: number, required = true) {
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error(`${label} é obrigatório.`);
  if (cleaned.length > maximum) throw new Error(`${label} excede o limite de ${maximum} caracteres.`);
  return cleaned;
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

export async function listTenantContent(tenantId: string, userId: string): Promise<ContentItem[]> {
  return inTenant(tenantId, userId, async (tx) => tx<ContentItem[]>`
    select id, content_type as "contentType", title, slug, summary, body,
      editorial_status as "editorialStatus", visibility, version, updated_at as "updatedAt"
    from content_items
    where tenant_id = ${tenantId} and deleted_at is null
    order by updated_at desc, id desc
  `);
}

export async function createNewsDraft(
  tenantId: string,
  actorUserId: string,
  input: { title: string; summary: string; body: string },
) {
  const title = cleanText(input.title, "Título", 150);
  const summary = cleanText(input.summary, "Resumo", 500, false) || null;
  const paragraphs = cleanText(input.body, "Texto", 10_000)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const slug = makeSlug(title);
  const contentId = randomUUID();
  await inTenant(tenantId, actorUserId, async (tx) => {
    const duplicate = await tx<{ id: string }[]>`
      select id from content_items where tenant_id = ${tenantId} and slug = ${slug} and deleted_at is null limit 1
    `;
    if (duplicate[0]) throw new Error("Já existe um conteúdo com este título. Altere-o para gerar uma URL diferente.");
    await tx`
      insert into content_items (id, tenant_id, content_type, title, slug, summary, body, created_by, comments_enabled)
      values (${contentId}, ${tenantId}, 'NEWS', ${title}, ${slug}, ${summary}, ${tx.json({ paragraphs })}, ${actorUserId}, true)
    `;
    await tx`
      insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
      values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'CONTENT_DRAFT_CREATED', 'CONTENT', ${contentId}, ${randomUUID()}, ${tx.json({ contentType: "NEWS", title, slug })})
    `;
  });
  return { id: contentId, slug };
}

export async function createPollDraft(tenantId: string, actorUserId: string, input: { title: string; summary: string; options: string[]; opensAt: string; closesAt: string }) {
  const title = cleanText(input.title, "Pergunta", 150);
  const summary = cleanText(input.summary, "Contexto", 500, false) || null;
  const options = input.options.map((option) => option.trim()).filter(Boolean).map((option) => cleanText(option, "Opção", 120));
  if (options.length < 2 || options.length > 8) throw new Error("A enquete precisa ter de 2 a 8 opções.");
  if (new Set(options.map((option) => option.toLocaleLowerCase("pt-BR"))).size !== options.length) throw new Error("As opções da enquete não podem se repetir.");
  const slug = makeSlug(title);
  const contentId = randomUUID();
  await inTenant(tenantId, actorUserId, async (tx) => {
    const tenant = await tx<{ timezone: string; operationalStatus: string }[]>`select timezone, operational_status as "operationalStatus" from tenants where id = ${tenantId} for update`;
    if (!tenant[0] || tenant[0].operationalStatus !== "ACTIVE") throw new Error("A instância não está ativa para receber conteúdo.");
    if (input.opensAt >= input.closesAt) throw new Error("O encerramento deve ocorrer depois da abertura.");
    const exists = await tx<{ exists: boolean }[]>`select exists(select 1 from content_items where tenant_id = ${tenantId} and slug = ${slug} and deleted_at is null) as exists`;
    if (exists[0]?.exists) throw new Error("Já existe um conteúdo com esse título.");
    await tx`insert into content_items (id, tenant_id, content_type, title, slug, summary, body, created_by)
      values (${contentId}, ${tenantId}, 'POLL', ${title}, ${slug}, ${summary}, '{}'::jsonb, ${actorUserId})`;
    await tx`insert into polls (tenant_id, content_id, opens_at, closes_at, result_visibility) values (
      ${tenantId}, ${contentId}, ${input.opensAt}::timestamp at time zone ${tenant[0].timezone},
      ${input.closesAt}::timestamp at time zone ${tenant[0].timezone}, 'AFTER_VOTE')`;
    for (const [index, label] of options.entries()) await tx`insert into poll_options (id, tenant_id, poll_id, label, sort_order) values (${randomUUID()}, ${tenantId}, ${contentId}, ${label}, ${index})`;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'POLL_DRAFT_CREATED', 'POLL', ${contentId}, ${randomUUID()})`;
  });
  return { id: contentId, slug };
}

export async function createNoticeDraft(tenantId: string, actorUserId: string, input: { title: string; summary: string; occursAt: string; expiresAt: string; targetUrl: string }) {
  const title = cleanText(input.title, "Título do aviso", 150);
  const summary = cleanText(input.summary, "Descrição", 1000, false) || null;
  const targetUrl = cleanText(input.targetUrl, "Destino", 500, false) || null;
  if (targetUrl) {
    const isInternalPath = targetUrl.startsWith("/") && !targetUrl.startsWith("//") && !targetUrl.includes("\\");
    let isHttpsUrl = false;
    try { isHttpsUrl = new URL(targetUrl).protocol === "https:"; } catch { /* caminho relativo */ }
    if (!isInternalPath && !isHttpsUrl) throw new Error("O destino deve ser um caminho do site ou uma URL HTTPS.");
  }
  const slug = makeSlug(title);
  const contentId = randomUUID();
  await inTenant(tenantId, actorUserId, async (tx) => {
    const tenant = await tx<{ timezone: string; operationalStatus: string }[]>`select timezone, operational_status as "operationalStatus" from tenants where id = ${tenantId} for update`;
    if (!tenant[0] || tenant[0].operationalStatus !== "ACTIVE") throw new Error("A instância não está ativa para receber conteúdo.");
    if (input.expiresAt && input.expiresAt <= input.occursAt) throw new Error("A expiração deve ocorrer depois do horário do aviso.");
    const exists = await tx<{ exists: boolean }[]>`select exists(select 1 from content_items where tenant_id = ${tenantId} and slug = ${slug} and deleted_at is null) as exists`;
    if (exists[0]?.exists) throw new Error("Já existe um conteúdo com esse título.");
    await tx`insert into content_items (id, tenant_id, content_type, title, slug, summary, body, created_by)
      values (${contentId}, ${tenantId}, 'NOTICE', ${title}, ${slug}, ${summary}, '{}'::jsonb, ${actorUserId})`;
    await tx`insert into notices (tenant_id, content_id, occurs_at, event_phase, target_url)
      values (${tenantId}, ${contentId}, ${input.occursAt}::timestamp at time zone ${tenant[0].timezone}, 'FUTURE', ${targetUrl})`;
    if (input.expiresAt) await tx`update content_items set unpublish_at = ${input.expiresAt}::timestamp at time zone ${tenant[0].timezone} where id = ${contentId} and tenant_id = ${tenantId}`;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'NOTICE_DRAFT_CREATED', 'NOTICE', ${contentId}, ${randomUUID()})`;
  });
  return { id: contentId, slug };
}

export async function publishContentRelease(tenantId: string, actorUserId: string) {
  const releaseId = randomUUID();
  await inTenant(tenantId, actorUserId, async (tx) => {
    const tenant = await tx<{ currentReleaseId: string | null; operationalStatus: string }[]>`
      select current_release_id as "currentReleaseId", operational_status as "operationalStatus"
      from tenants where id = ${tenantId} for update
    `;
    if (!tenant[0]) throw new Error("Instância não encontrada.");
    if (tenant[0].operationalStatus !== "ACTIVE") throw new Error("A publicação está bloqueada enquanto a instância não estiver ativa.");
    const versions = await tx<{ nextVersion: number }[]>`
      select coalesce(max(version), 0)::integer + 1 as "nextVersion" from site_releases where tenant_id = ${tenantId}
    `;
    const nextVersion = versions[0]?.nextVersion;
    if (!nextVersion) throw new Error("Não foi possível calcular a próxima versão pública.");
    await tx`
      update content_items
      set editorial_status = 'PUBLISHED', published_by = ${actorUserId}, published_at = coalesce(published_at, now()), updated_at = now()
      where tenant_id = ${tenantId} and editorial_status = 'DRAFT' and visibility = 'PUBLIC' and deleted_at is null
    `;
    await tx`
      insert into site_releases (id, tenant_id, version, state, published_at, published_by, based_on_release_id)
      values (${releaseId}, ${tenantId}, ${nextVersion}, 'PUBLISHED', now(), ${actorUserId}, ${tenant[0].currentReleaseId})
    `;
    await tx`
      insert into site_release_content (tenant_id, release_id, content_id, content_version, content_type, slug, snapshot)
      select item.tenant_id, ${releaseId}, item.id, item.version, item.content_type, item.slug,
        jsonb_build_object(
          'title', item.title, 'summary', item.summary, 'body', item.body,
          'authorDisplay', item.author_display, 'publishedAt', item.published_at,
          'commentsEnabled', item.comments_enabled
        )
      from content_items item
      where item.tenant_id = ${tenantId}
        and item.editorial_status = 'PUBLISHED'
        and item.visibility = 'PUBLIC'
        and item.deleted_at is null
    `;
    await tx`
      insert into routes (id, tenant_id, release_id, path, content_id, route_state)
      select gen_random_uuid(), item.tenant_id, ${releaseId}, '/historias/' || item.slug, item.id, 'PUBLISHED'
      from content_items item
      where item.tenant_id = ${tenantId} and item.content_type = 'NEWS'
        and item.editorial_status = 'PUBLISHED' and item.visibility = 'PUBLIC' and item.deleted_at is null
    `;
    if (tenant[0].currentReleaseId) {
      await tx`update site_releases set state = 'SUPERSEDED' where id = ${tenant[0].currentReleaseId} and tenant_id = ${tenantId}`;
    }
    await tx`update tenants set current_release_id = ${releaseId}, updated_at = now() where id = ${tenantId}`;
    await tx`
      insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
      values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'SITE_RELEASE_PUBLISHED', 'SITE_RELEASE', ${releaseId}, ${randomUUID()}, ${tx.json({ version: nextVersion })})
    `;
  });
  return releaseId;
}

export async function getPublishedContent(tenantId: string, contentType?: ContentItem["contentType"]): Promise<PublishedContent[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PUBLIC", tenantId });
      return tx<PublishedContent[]>`
        select release_content.content_id as id, release_content.content_type as "contentType", release_content.slug,
          release_content.content_version as version, release_content.snapshot->>'title' as title,
          release_content.snapshot->>'summary' as summary, coalesce(release_content.snapshot->'body', '{}'::jsonb) as body,
          release_content.snapshot->>'authorDisplay' as "authorDisplay",
          (release_content.snapshot->>'publishedAt')::timestamptz as "publishedAt",
          coalesce((release_content.snapshot->>'commentsEnabled')::boolean, content.comments_enabled, false) as "commentsEnabled"
        from tenants tenant
        join site_release_content release_content
          on release_content.tenant_id = tenant.id and release_content.release_id = tenant.current_release_id
        join content_items content on content.tenant_id = release_content.tenant_id and content.id = release_content.content_id
        where tenant.id = ${tenantId}
          and (${contentType ?? null}::text is null or release_content.content_type = ${contentType ?? null})
        order by "publishedAt" desc nulls last, release_content.content_id desc
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function getPublishedContentBySlug(tenantId: string, slug: string) {
  const content = await getPublishedContent(tenantId);
  return content.find((item) => item.slug === slug) ?? null;
}
