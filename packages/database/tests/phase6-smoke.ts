import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@baixada/database/client";
import {
  acknowledgeMemberNotification,
  castPollVote,
  createComment,
  deleteOwnComment,
  listPublicComments,
  listPublishedNotices,
  listUnreadMemberNotifications,
  moderateComment,
} from "../../../apps/web/src/lib/community";
import { listModerationCases, reportComment } from "../../../apps/web/src/lib/moderation";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_PHASE6_LOCAL !== "1" || !databaseUrl) {
  throw new Error("Set RUN_PHASE6_LOCAL=1 and DATABASE_URL to run the isolated local Fatia 6 smoke test.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!localHosts.has(parsedDatabaseUrl.hostname) || parsedDatabaseUrl.pathname !== "/baixada") {
  throw new Error("Safety check: this smoke test only runs against the local database named baixada.");
}

const sql = createDatabaseClient(databaseUrl);
const tenantId = randomUUID();
const releaseId = randomUUID();
const adminId = randomUUID();
const authorId = randomUUID();
const reporterId = randomUUID();
const suspendedId = randomUUID();
const pendingId = randomUUID();
const adminMembershipId = randomUUID();
const authorMembershipId = randomUUID();
const reporterMembershipId = randomUUID();
const suspendedMembershipId = randomUUID();
const pendingMembershipId = randomUUID();
const newsId = randomUUID();
const pollId = randomUUID();
const noticeId = randomUUID();
const pollOptionAId = randomUUID();
const pollOptionBId = randomUUID();

async function seedFixture() {
  await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    const roles = await tx<{ id: string }[]>`select id from roles where code = 'ADMIN' limit 1`;
    const permissions = await tx<{ id: string }[]>`select id from permissions where code = 'comments.moderate' limit 1`;
    assert.ok(roles[0], "The local permission catalog must contain the ADMIN role.");
    assert.ok(permissions[0], "The local permission catalog must contain comments.moderate.");
    const roleGrants = await tx<{ permitted: boolean }[]>`
      select exists(select 1 from role_permissions where role_id = ${roles[0].id} and permission_id = ${permissions[0].id}) as permitted
    `;
    assert.equal(roleGrants[0]?.permitted, true, "The local ADMIN role must already have comment moderation permission.");

    await tx`insert into users (id, email, email_normalized, display_name, birth_date, global_status) values
      (${adminId}, ${`${adminId}@phase6.invalid`}, ${`${adminId}@phase6.invalid`}, 'Administrador Fatia 6', '1990-01-01', 'ACTIVE'),
      (${authorId}, ${`${authorId}@phase6.invalid`}, ${`${authorId}@phase6.invalid`}, 'Autor Fatia 6', '1990-01-01', 'ACTIVE'),
      (${reporterId}, ${`${reporterId}@phase6.invalid`}, ${`${reporterId}@phase6.invalid`}, 'Denunciante Fatia 6', '1990-01-01', 'ACTIVE'),
      (${suspendedId}, ${`${suspendedId}@phase6.invalid`}, ${`${suspendedId}@phase6.invalid`}, 'Conta Suspensa Fatia 6', '1990-01-01', 'SUSPENDED'),
      (${pendingId}, ${`${pendingId}@phase6.invalid`}, ${`${pendingId}@phase6.invalid`}, 'Cadastro Pendente Fatia 6', '1990-01-01', 'ACTIVE')`;

    await tx`insert into tenants (id, slug, legal_name, display_name, operational_status)
      values (${tenantId}, ${`phase6-${tenantId}`}, 'Fatia 6 Local LTDA', 'Fatia 6 Local', 'ACTIVE')`;
    await tx`insert into tenant_memberships (id, tenant_id, user_id, relationship_text, status) values
      (${adminMembershipId}, ${tenantId}, ${adminId}, 'Admin de teste', 'APPROVED'),
      (${authorMembershipId}, ${tenantId}, ${authorId}, 'Autor de teste', 'APPROVED'),
      (${reporterMembershipId}, ${tenantId}, ${reporterId}, 'Membro de teste', 'APPROVED'),
      (${suspendedMembershipId}, ${tenantId}, ${suspendedId}, 'Conta suspensa globalmente', 'APPROVED'),
      (${pendingMembershipId}, ${tenantId}, ${pendingId}, 'Cadastro pendente', 'PENDING')`;
    await tx`insert into membership_roles (tenant_id, membership_id, role_id, granted_by)
      values (${tenantId}, ${adminMembershipId}, ${roles[0].id}, ${adminId})`;

    await tx`insert into content_items (id, tenant_id, content_type, title, slug, summary, editorial_status, visibility,
        created_by, published_by, published_at, comments_enabled, unpublish_at) values
      (${newsId}, ${tenantId}, 'NEWS', 'Notícia de teste', 'noticia-smoke', 'Resumo', 'PUBLISHED', 'PUBLIC', ${adminId}, ${adminId}, now(), true, null),
      (${pollId}, ${tenantId}, 'POLL', 'Enquete de teste', 'enquete-smoke', 'Resumo', 'PUBLISHED', 'PUBLIC', ${adminId}, ${adminId}, now(), false, null),
      (${noticeId}, ${tenantId}, 'NOTICE', 'Aviso de teste', 'aviso-smoke', 'Resumo', 'PUBLISHED', 'PUBLIC', ${adminId}, ${adminId}, now(), false, now() + interval '1 day')`;
    await tx`insert into polls (tenant_id, content_id, opens_at, closes_at, result_visibility)
      values (${tenantId}, ${pollId}, now() - interval '1 hour', now() + interval '1 hour', 'AFTER_VOTE')`;
    await tx`insert into poll_options (id, tenant_id, poll_id, label, sort_order) values
      (${pollOptionAId}, ${tenantId}, ${pollId}, 'Opção A', 1),
      (${pollOptionBId}, ${tenantId}, ${pollId}, 'Opção B', 2)`;
    await tx`insert into notices (tenant_id, content_id, occurs_at, event_phase)
      values (${tenantId}, ${noticeId}, now() - interval '1 hour', 'HAPPENED')`;
    await tx`insert into site_releases (id, tenant_id, version, state, published_at, published_by)
      values (${releaseId}, ${tenantId}, 1, 'PUBLISHED', now(), ${adminId})`;
    await tx`update tenants set current_release_id = ${releaseId} where id = ${tenantId}`;
    await tx`insert into site_release_content (tenant_id, release_id, content_id, content_version, content_type, slug, snapshot) values
      (${tenantId}, ${releaseId}, ${newsId}, 1, 'NEWS', 'noticia-smoke', ${tx.json({ commentsEnabled: true })}),
      (${tenantId}, ${releaseId}, ${pollId}, 1, 'POLL', 'enquete-smoke', ${tx.json({})}),
      (${tenantId}, ${releaseId}, ${noticeId}, 1, 'NOTICE', 'aviso-smoke', ${tx.json({})})`;
  });
}

async function cleanupFixture() {
  await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    await tx`delete from notification_deliveries where tenant_id = ${tenantId}`;
    await tx`delete from notifications where tenant_id = ${tenantId}`;
    await tx`delete from audit_events where tenant_id = ${tenantId}`;
    await tx`delete from moderation_actions where tenant_id = ${tenantId}`;
    await tx`delete from moderation_targets where tenant_id = ${tenantId}`;
    await tx`delete from moderation_appeals where tenant_id = ${tenantId}`;
    await tx`delete from moderation_cases where tenant_id = ${tenantId}`;
    await tx`delete from poll_votes where tenant_id = ${tenantId}`;
    await tx`delete from poll_options where tenant_id = ${tenantId}`;
    await tx`delete from polls where tenant_id = ${tenantId}`;
    await tx`delete from notices where tenant_id = ${tenantId}`;
    await tx`delete from site_release_content where tenant_id = ${tenantId}`;
    await tx`update tenants set current_release_id = null where id = ${tenantId}`;
    await tx`delete from site_releases where tenant_id = ${tenantId}`;
    await tx`delete from comments where tenant_id = ${tenantId}`;
    await tx`delete from content_items where tenant_id = ${tenantId}`;
    await tx`delete from membership_roles where tenant_id = ${tenantId}`;
    await tx`delete from tenant_memberships where tenant_id = ${tenantId}`;
    await tx`delete from tenants where id = ${tenantId}`;
    await tx`delete from users where id = any(${[adminId, authorId, reporterId, suspendedId, pendingId]}::uuid[])`;
  });
}

async function runSmoke() {
  await seedFixture();

  const commentId = await createComment(tenantId, authorId, newsId, "Comentário aparece antes da moderação.");
  assert.equal((await listPublicComments(tenantId, newsId, authorId)).length, 1, "A publicação deve exibir comentário imediatamente.");
  const caseId = await reportComment(tenantId, reporterId, commentId, "Solicito revisão deste comentário.");
  await assert.rejects(() => reportComment(tenantId, reporterId, commentId, "Denúncia duplicada."), /já denunciou/);
  const cases = await listModerationCases(tenantId, { includeComments: true, includeMedia: false });
  assert.ok(cases.some((item) => item.id === caseId && item.status === "OPEN"), "A denúncia deve entrar na fila administrativa.");
  const adminQueue = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ pendingEmail: number; inAppDelivered: number }[]>`
      select count(*) filter (where delivery.channel = 'EMAIL' and delivery.status = 'PENDING')::integer as "pendingEmail",
        count(*) filter (where delivery.channel = 'IN_APP' and delivery.status = 'DELIVERED')::integer as "inAppDelivered"
      from notifications notification
      join notification_deliveries delivery on delivery.tenant_id = notification.tenant_id and delivery.notification_id = notification.id
      where notification.tenant_id = ${tenantId} and notification.recipient_user_id = ${adminId} and notification.notification_type = 'COMMENT_REPORT'
    `;
  });
  assert.deepEqual(adminQueue[0], { pendingEmail: 1, inAppDelivered: 1 }, "A denúncia deve persistir aviso de painel e e-mail na outbox.");

  await moderateComment(tenantId, adminId, commentId, "HIDE", "A mensagem desrespeita as regras da comunidade.");
  assert.equal((await listPublicComments(tenantId, newsId, authorId)).length, 0, "Comentário ocultado não deve permanecer público.");
  const authorNotices = await listUnreadMemberNotifications(tenantId, authorId);
  assert.equal(authorNotices.length, 1, "A decisão deve gerar aviso persistente para o autor.");
  const authorNotice = authorNotices[0];
  assert.ok(authorNotice);
  await acknowledgeMemberNotification(tenantId, authorId, authorNotice.id);
  assert.equal((await listUnreadMemberNotifications(tenantId, authorId)).length, 0, "Confirmar o modal deve marcar o aviso como lido.");

  const deletableCommentId = await createComment(tenantId, authorId, newsId, "Este comentário será removido pelo próprio autor.");
  await assert.rejects(() => deleteOwnComment(tenantId, reporterId, deletableCommentId), /não pertence a você/);
  await deleteOwnComment(tenantId, authorId, deletableCommentId);

  const concurrentVotes = await Promise.allSettled([
    castPollVote(tenantId, reporterId, pollId, pollOptionAId),
    castPollVote(tenantId, reporterId, pollId, pollOptionBId),
  ]);
  assert.equal(concurrentVotes.filter((result) => result.status === "fulfilled").length, 1, "Votos concorrentes devem aceitar exatamente uma opção.");
  assert.equal(concurrentVotes.filter((result) => result.status === "rejected").length, 1, "O voto concorrente perdedor deve receber conflito.");
  await assert.rejects(() => castPollVote(tenantId, suspendedId, pollId, pollOptionAId), /precisa estar aprovado/);
  await assert.rejects(() => castPollVote(tenantId, pendingId, pollId, pollOptionAId), /precisa estar aprovado/);
  await assert.rejects(() => createComment(randomUUID(), reporterId, newsId, "Conteúdo de outro tenant."), /vínculo/);

  const noticesBeforeExpiry = await listPublishedNotices(tenantId);
  assert.ok(noticesBeforeExpiry.some((notice) => notice.id === noticeId && notice.happened), "Aviso ocorrido deve continuar visível como acontecido.");
  await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
    await tx`select set_config('app.is_superuser', 'true', true)`;
    await tx`update content_items set unpublish_at = now() - interval '1 second' where tenant_id = ${tenantId} and id = ${noticeId}`;
  });
  const noticesAfterExpiry = await listPublishedNotices(tenantId);
  assert.ok(!noticesAfterExpiry.some((notice) => notice.id === noticeId), "Aviso expirado deve sair do site público.");

  console.info("Fatia 6 local smoke: comentários, denúncia, moderação/notificação, voto concorrente, elegibilidade e expiração de aviso aprovados.");
}

try {
  await runSmoke();
} finally {
  try {
    await cleanupFixture();
  } finally {
    await sql.end();
  }
}
