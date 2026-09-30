import { randomUUID } from "node:crypto";
import { createDatabaseClient, type DatabaseQuery } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";

export type MediaConsent = { id: string; subjectReference: string; externalDocumentReference: string; validUntil: string | null; revokedAt: Date | null; mediaId: string | null; originalFilename: string | null };
export type ModerationCase = {
  id: string;
  caseType: string;
  status: string;
  priority: string;
  dueAt: Date;
  reason: string;
  reporterName: string;
  mediaId: string | null;
  originalFilename: string | null;
  commentId: string | null;
  commentBody: string | null;
  commentAuthor: string | null;
};

async function inTenant<T>(tenantId: string, userId: string, work: (tx: DatabaseQuery) => Promise<T>) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      return work(tx);
    });
  } finally { await sql.end(); }
}

function required(value: string, label: string, maximum: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} é obrigatório.`);
  if (clean.length > maximum) throw new Error(`${label} excede ${maximum} caracteres.`);
  return clean;
}

export async function listMediaConsents(tenantId: string, userId: string): Promise<MediaConsent[]> {
  return inTenant(tenantId, userId, async (tx) => tx<MediaConsent[]>`
    select consent.id, consent.subject_reference as "subjectReference", consent.external_document_reference as "externalDocumentReference",
      consent.valid_until::text as "validUntil", consent.revoked_at as "revokedAt", link.media_id as "mediaId", asset.original_filename as "originalFilename"
    from image_consents consent left join media_consent_links link on link.consent_id = consent.id and link.tenant_id = consent.tenant_id
    left join media_assets asset on asset.id = link.media_id and asset.tenant_id = link.tenant_id
    where consent.tenant_id = ${tenantId} order by consent.created_at desc limit 30
  `);
}

export async function registerMediaConsent(tenantId: string, actorUserId: string, input: { mediaId: string; subjectReference: string; documentReference: string; guardianName: string; guardianEmail: string; validUntil: string }) {
  const consentId = randomUUID();
  const subjectReference = required(input.subjectReference, "Referência da pessoa", 180);
  const documentReference = required(input.documentReference, "Referência do documento", 500);
  const guardianName = input.guardianName.trim() || null;
  const guardianEmail = input.guardianEmail.trim().toLowerCase() || null;
  const validUntil = input.validUntil || null;
  if (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) throw new Error("Informe um e-mail de responsável válido.");
  await inTenant(tenantId, actorUserId, async (tx) => {
    const asset = await tx<{ id: string }[]>`select id from media_assets where id = ${input.mediaId} and tenant_id = ${tenantId} and deleted_at is null limit 1`;
    if (!asset[0]) throw new Error("A mídia escolhida não pertence a esta instância.");
    await tx`
      insert into image_consents (id, tenant_id, subject_reference, guardian_name, guardian_email, external_document_reference, scope, valid_from, valid_until, recorded_by)
      values (${consentId}, ${tenantId}, ${subjectReference}, ${guardianName}, ${guardianEmail}, ${documentReference}, 'IMAGE_PUBLICATION', current_date, ${validUntil}, ${actorUserId})
    `;
    await tx`insert into media_consent_links (tenant_id, media_id, consent_id) values (${tenantId}, ${input.mediaId}, ${consentId})`;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data) values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'IMAGE_CONSENT_RECORDED', 'IMAGE_CONSENT', ${consentId}, ${randomUUID()}, ${tx.json({ mediaId: input.mediaId, subjectReference })})`;
  });
}

export async function revokeMediaConsent(tenantId: string, actorUserId: string, consentId: string, reason: string) {
  const revocationReason = required(reason, "Motivo da revogação", 1000);
  await inTenant(tenantId, actorUserId, async (tx) => {
    const consent = await tx<{ id: string }[]>`select id from image_consents where id = ${consentId} and tenant_id = ${tenantId} and revoked_at is null for update`;
    if (!consent[0]) throw new Error("Consentimento ativo não encontrado.");
    await tx`update image_consents set revoked_at = now(), revocation_reason = ${revocationReason} where id = ${consentId} and tenant_id = ${tenantId}`;
    await tx`
      update media_assets set visibility = 'HIDDEN', updated_at = now()
      where tenant_id = ${tenantId} and id in (select media_id from media_consent_links where tenant_id = ${tenantId} and consent_id = ${consentId})
    `;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason) values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'IMAGE_CONSENT_REVOKED_MEDIA_HIDDEN', 'IMAGE_CONSENT', ${consentId}, ${randomUUID()}, ${revocationReason})`;
  });
}

export async function listModerationCases(tenantId: string, userId: string, options: { includeComments?: boolean; includeMedia?: boolean } = { includeComments: true, includeMedia: true }): Promise<ModerationCase[]> {
  return inTenant(tenantId, userId, async (tx) => tx<ModerationCase[]>`
    select item.id, item.case_type as "caseType", item.status, item.priority, item.due_at as "dueAt", item.reason,
      item.reporter_name as "reporterName", target.media_id as "mediaId", asset.original_filename as "originalFilename",
      target.comment_id as "commentId", comment.body as "commentBody", author.display_name as "commentAuthor"
    from moderation_cases item left join moderation_targets target on target.case_id = item.id and target.tenant_id = item.tenant_id
    left join media_assets asset on asset.id = target.media_id and asset.tenant_id = target.tenant_id
    left join comments comment on comment.id = target.comment_id and comment.tenant_id = target.tenant_id
    left join users author on author.id = comment.user_id
    where item.tenant_id = ${tenantId}
      and (${options.includeComments ?? true} or item.case_type not in ('COMMENT_REPORT', 'COMMENT_MODERATION'))
      and (${options.includeMedia ?? true} or item.case_type not in ('MEDIA_REPORT', 'IMAGE_REPORT'))
    order by case when item.status in ('OPEN', 'HIDDEN_PENDING_REVIEW', 'UNDER_REVIEW', 'APPEALED') then 0 else 1 end,
      item.due_at, item.opened_at desc limit 30
  `);
}

export async function reportComment(tenantId: string, reporterUserId: string, commentId: string, reason: string) {
  const reportReason = required(reason, "Motivo da denúncia", 2000);
  const caseId = randomUUID();
  await inTenant(tenantId, reporterUserId, async (tx) => {
    const members = await tx<{ displayName: string }[]>`
      select user_account.display_name as "displayName"
      from tenant_memberships membership join users user_account on user_account.id = membership.user_id
      where membership.tenant_id = ${tenantId} and membership.user_id = ${reporterUserId}
        and membership.status = 'APPROVED' and user_account.global_status = 'ACTIVE'
      limit 1
    `;
    if (!members[0]) throw new Error("Somente membros aprovados e ativos podem denunciar comentários.");
    const comments = await tx<{ id: string; authorUserId: string; contentTitle: string }[]>`
      select comment.id, comment.user_id as "authorUserId", content.title as "contentTitle"
      from comments comment
      join content_items content on content.tenant_id = comment.tenant_id and content.id = comment.content_id
      join tenants tenant on tenant.id = comment.tenant_id
      join site_release_content release_content on release_content.tenant_id = tenant.id
        and release_content.release_id = tenant.current_release_id and release_content.content_id = content.id
      where comment.id = ${commentId} and comment.tenant_id = ${tenantId} and comment.status = 'VISIBLE'
        and comment.deleted_at is null and comment.user_id <> ${reporterUserId}
        and coalesce((release_content.snapshot->>'commentsEnabled')::boolean, content.comments_enabled, false) = true
      for update of comment
    `;
    const comment = comments[0];
    if (!comment) throw new Error("Comentário não encontrado, indisponível para denúncia ou não pertence a outro usuário.");
    const duplicate = await tx<{ id: string }[]>`
      select moderation_case.id
      from moderation_cases moderation_case
      join moderation_targets target on target.tenant_id = moderation_case.tenant_id and target.case_id = moderation_case.id
      where moderation_case.tenant_id = ${tenantId} and moderation_case.reporter_user_id = ${reporterUserId}
        and target.comment_id = ${commentId} and moderation_case.status not in ('RESOLVED', 'CLOSED')
      limit 1
    `;
    if (duplicate[0]) throw new Error("Você já denunciou este comentário e a equipe está analisando o caso.");

    await tx`
      insert into moderation_cases (id, tenant_id, case_type, reporter_name, reporter_contact, reporter_user_id, reason, priority, status)
      values (${caseId}, ${tenantId}, 'COMMENT_REPORT', ${members[0].displayName}, 'internal-user', ${reporterUserId}, ${reportReason}, 'HIGH', 'OPEN')
    `;
    await tx`insert into moderation_targets (id, tenant_id, case_id, comment_id) values (${randomUUID()}, ${tenantId}, ${caseId}, ${commentId})`;
    await tx`
      insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason, after_data)
      values (${randomUUID()}, ${tenantId}, ${reporterUserId}, 'USER', 'COMMENT_REPORTED', 'MODERATION_CASE', ${caseId}, ${randomUUID()}, ${reportReason},
        ${JSON.stringify({ commentId, contentTitle: comment.contentTitle })}::jsonb)
    `;

    const admins = await tx<{ userId: string }[]>`
      select distinct membership.user_id as "userId"
      from tenant_memberships membership
      join users user_account on user_account.id = membership.user_id and user_account.global_status = 'ACTIVE'
      where membership.tenant_id = ${tenantId} and membership.status = 'APPROVED'
        and (
          exists (
            select 1 from membership_roles membership_role
            join role_permissions role_permission on role_permission.role_id = membership_role.role_id
            join permissions permission on permission.id = role_permission.permission_id and permission.code = 'comments.moderate'
            where membership_role.tenant_id = membership.tenant_id and membership_role.membership_id = membership.id
          )
          or exists (
            select 1 from membership_permission_overrides permission_override
            join permissions permission on permission.id = permission_override.permission_id and permission.code = 'comments.moderate'
            where permission_override.tenant_id = membership.tenant_id and permission_override.membership_id = membership.id
              and permission_override.effect = 'ALLOW'
          )
        )
        and not exists (
          select 1 from membership_permission_overrides permission_override
          join permissions permission on permission.id = permission_override.permission_id and permission.code = 'comments.moderate'
          where permission_override.tenant_id = membership.tenant_id and permission_override.membership_id = membership.id
            and permission_override.effect = 'DENY'
        )
    `;
    for (const admin of admins) {
      const notificationId = randomUUID();
      const inserted = await tx<{ id: string }[]>`
        insert into notifications (id, tenant_id, recipient_user_id, notification_type, dedupe_key, payload)
        values (${notificationId}, ${tenantId}, ${admin.userId}, 'COMMENT_REPORT', ${`comment-report:${caseId}`},
          ${JSON.stringify({ title: 'Novo comentário denunciado', body: 'Há um comentário aguardando análise na fila de moderação.', href: '/admin/moderacao', caseId })}::jsonb)
        on conflict (tenant_id, recipient_user_id, dedupe_key) where dedupe_key is not null do nothing
        returning id
      `;
      if (inserted[0]) {
        await tx`insert into notification_deliveries (id, tenant_id, notification_id, channel, status) values (${randomUUID()}, ${tenantId}, ${notificationId}, 'IN_APP', 'DELIVERED')`;
        await tx`insert into notification_deliveries (id, tenant_id, notification_id, channel, status) values (${randomUUID()}, ${tenantId}, ${notificationId}, 'EMAIL', 'PENDING')`;
      }
    }
  });
  return caseId;
}

export async function hideMediaPendingReview(tenantId: string, actorUserId: string, mediaId: string, reason: string) {
  const caseId = randomUUID();
  const caseReason = required(reason, "Motivo da denúncia", 2000);
  await inTenant(tenantId, actorUserId, async (tx) => {
    const asset = await tx<{ id: string }[]>`select id from media_assets where id = ${mediaId} and tenant_id = ${tenantId} and deleted_at is null for update`;
    if (!asset[0]) throw new Error("Mídia não encontrada.");
    await tx`
      insert into moderation_cases (id, tenant_id, case_type, reporter_name, reporter_contact, reason, priority, status)
      values (${caseId}, ${tenantId}, 'MEDIA_REPORT', 'Administrador da instância', 'painel', ${caseReason}, 'HIGH', 'HIDDEN_PENDING_REVIEW')
    `;
    await tx`insert into moderation_targets (id, tenant_id, case_id, media_id) values (${randomUUID()}, ${tenantId}, ${caseId}, ${mediaId})`;
    await tx`update media_assets set visibility = 'HIDDEN', updated_at = now() where id = ${mediaId} and tenant_id = ${tenantId}`;
    await tx`insert into moderation_actions (id, tenant_id, case_id, action, previous_state, new_state, justification, performed_by) values (${randomUUID()}, ${tenantId}, ${caseId}, 'HIDE', 'VISIBLE', 'HIDDEN_PENDING_REVIEW', ${caseReason}, ${actorUserId})`;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason) values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'MEDIA_HIDDEN_PENDING_REVIEW', 'MEDIA_ASSET', ${mediaId}, ${randomUUID()}, ${caseReason})`;
  });
}
