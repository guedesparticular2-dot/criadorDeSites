import { randomUUID } from "node:crypto";
import { createDatabaseClient, type DatabaseQuery } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";

async function inTenant<T>(tenantId: string, userId: string, work: (tx: DatabaseQuery) => Promise<T>) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      return work(tx);
    });
  } finally { await sql.end(); }
}

async function ensureApprovedMember(tx: DatabaseQuery, tenantId: string, userId: string) {
  const rows = await tx<{ id: string }[]>`
    select membership.id
    from tenant_memberships membership
    join users user_account on user_account.id = membership.user_id and user_account.global_status = 'ACTIVE'
    where membership.tenant_id = ${tenantId} and membership.user_id = ${userId} and membership.status = 'APPROVED'
    limit 1
  `;
  if (!rows[0]) throw new Error("Seu vínculo nesta instância precisa estar aprovado para participar.");
}

export async function isApprovedTenantMember(tenantId: string, userId: string) {
  return inTenant(tenantId, userId, async (tx) => {
    const rows = await tx<{ permitted: boolean }[]>`
      select exists(
        select 1 from tenant_memberships membership join users user_account on user_account.id = membership.user_id
        where membership.tenant_id = ${tenantId} and membership.user_id = ${userId}
          and membership.status = 'APPROVED' and user_account.global_status = 'ACTIVE'
      ) as permitted
    `;
    return Boolean(rows[0]?.permitted);
  });
}

export async function createComment(tenantId: string, userId: string, contentId: string, text: string) {
  const body = text.trim();
  if (!body || body.length > 2000) throw new Error("O comentário deve ter entre 1 e 2.000 caracteres.");
  const commentId = randomUUID();
  await inTenant(tenantId, userId, async (tx) => {
    await ensureApprovedMember(tx, tenantId, userId);
    const content = await tx<{ id: string }[]>`
      select content.id from content_items content
      join tenants tenant on tenant.id = content.tenant_id
      join site_release_content release_content on release_content.tenant_id = tenant.id
        and release_content.release_id = tenant.current_release_id and release_content.content_id = content.id
      where content.id = ${contentId} and content.tenant_id = ${tenantId}
        and coalesce((release_content.snapshot->>'commentsEnabled')::boolean, content.comments_enabled, false) = true limit 1
    `;
    if (!content[0]) throw new Error("Este conteúdo não aceita comentários.");
    await tx`insert into comments (id, tenant_id, content_id, user_id, body) values (${commentId}, ${tenantId}, ${contentId}, ${userId}, ${body})`;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${tenantId}, ${userId}, 'USER', 'COMMENT_CREATED', 'COMMENT', ${commentId}, ${randomUUID()})`;
  });
  return commentId;
}

export async function listPublicComments(tenantId: string, contentId: string, viewerUserId?: string) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PUBLIC", tenantId });
      const allowed = await tx<{ id: string }[]>`
        select content.id from content_items content
        join tenants tenant on tenant.id = content.tenant_id
        join site_release_content release_content on release_content.tenant_id = tenant.id
          and release_content.release_id = tenant.current_release_id and release_content.content_id = content.id
        where content.id = ${contentId} and content.tenant_id = ${tenantId}
          and coalesce((release_content.snapshot->>'commentsEnabled')::boolean, content.comments_enabled, false) = true limit 1
      `;
      if (!allowed[0]) return [];
      const comments = await tx<{ id: string; authorName: string; authorUserId: string; body: string; createdAt: Date }[]>`
        select comment.id, user_account.display_name as "authorName", comment.user_id as "authorUserId", comment.body, comment.created_at as "createdAt"
        from comments comment join users user_account on user_account.id = comment.user_id
        where comment.tenant_id = ${tenantId} and comment.content_id = ${contentId}
          and comment.status = 'VISIBLE' and comment.deleted_at is null
        order by comment.created_at asc, comment.id asc limit 100
      `;
      return comments.map(({ authorUserId, ...comment }) => ({ ...comment, canDelete: Boolean(viewerUserId && authorUserId === viewerUserId) }));
    });
  } finally { await sql.end(); }
}

export async function deleteOwnComment(tenantId: string, userId: string, commentId: string) {
  await inTenant(tenantId, userId, async (tx) => {
    const deleted = await tx<{ id: string }[]>`
      update comments set deleted_at = now(), status = 'REMOVED'
      where id = ${commentId} and tenant_id = ${tenantId} and user_id = ${userId} and deleted_at is null
      returning id
    `;
    if (!deleted[0]) throw new Error("O comentário não existe ou não pertence a você.");
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${tenantId}, ${userId}, 'USER', 'COMMENT_DELETED_BY_AUTHOR', 'COMMENT', ${commentId}, ${randomUUID()})`;
  });
}

export async function moderateComment(tenantId: string, actorUserId: string, commentId: string, action: "HIDE" | "REMOVE" | "KEEP", reason: string) {
  const justification = reason.trim();
  if (!justification || justification.length > 1000) throw new Error("Informe uma justificativa de até 1.000 caracteres.");
  await inTenant(tenantId, actorUserId, async (tx) => {
    const comments = await tx<{ id: string; authorUserId: string; contentId: string; contentSlug: string; status: string }[]>`
      select comment.id, comment.user_id as "authorUserId", comment.content_id as "contentId",
        content.slug as "contentSlug", comment.status
      from comments comment join content_items content on content.tenant_id = comment.tenant_id and content.id = comment.content_id
      where comment.id = ${commentId} and comment.tenant_id = ${tenantId} and comment.deleted_at is null
      for update of comment
    `;
    const comment = comments[0];
    if (!comment) throw new Error("Comentário não encontrado.");
    const cases = await tx<{ id: string }[]>`
      select moderation_case.id from moderation_cases moderation_case
      join moderation_targets target on target.tenant_id = moderation_case.tenant_id and target.case_id = moderation_case.id
      where moderation_case.tenant_id = ${tenantId} and target.comment_id = ${commentId}
        and moderation_case.status not in ('RESOLVED', 'CLOSED')
      order by moderation_case.opened_at asc limit 1 for update of moderation_case
    `;
    let caseId = cases[0]?.id;
    if (!caseId) {
      caseId = randomUUID();
      await tx`insert into moderation_cases (id, tenant_id, case_type, reporter_name, reporter_contact, reason, priority, status)
        values (${caseId}, ${tenantId}, 'COMMENT_MODERATION', 'Moderação administrativa', 'internal', ${justification}, 'NORMAL', 'UNDER_REVIEW')`;
      await tx`insert into moderation_targets (id, tenant_id, case_id, comment_id) values (${randomUUID()}, ${tenantId}, ${caseId}, ${commentId})`;
    }
    const actionId = randomUUID();
    if (action !== "KEEP") {
      const status = action === "HIDE" ? "HIDDEN" : "REMOVED";
      await tx`
        update comments set status = ${status}, moderated_by = ${actorUserId}, moderated_at = now(),
          deleted_at = case when ${action} = 'REMOVE' then now() else deleted_at end
        where id = ${commentId} and tenant_id = ${tenantId}
      `;
      await tx`insert into moderation_actions (id, tenant_id, case_id, action, previous_state, new_state, justification, performed_by)
        values (${actionId}, ${tenantId}, ${caseId}, ${action === 'HIDE' ? 'HIDE' : 'REMOVE_LOGICALLY'}, ${comment.status}, ${status}, ${justification}, ${actorUserId})`;
      const notice = action === "HIDE" ? "Seu comentário foi ocultado por um moderador." : "Seu comentário foi removido por um moderador.";
      const dedupeKey = `comment-moderated:${actionId}`;
      const notifications = await tx<{ id: string }[]>`
        insert into notifications (id, tenant_id, recipient_user_id, notification_type, dedupe_key, payload)
        values (${randomUUID()}, ${tenantId}, ${comment.authorUserId}, 'COMMENT_MODERATED', ${dedupeKey},
          ${JSON.stringify({ title: 'Comentário moderado', body: `${notice} Motivo informado: ${justification}`, action, contentSlug: comment.contentSlug })}::jsonb)
        returning id
      `;
      if (notifications[0]) await tx`
        insert into notification_deliveries (id, tenant_id, notification_id, channel, status)
        values (${randomUUID()}, ${tenantId}, ${notifications[0].id}, 'IN_APP', 'DELIVERED')
      `;
    } else {
      await tx`insert into moderation_actions (id, tenant_id, case_id, action, previous_state, new_state, justification, performed_by)
        values (${actionId}, ${tenantId}, ${caseId}, 'KEEP', ${comment.status}, ${comment.status}, ${justification}, ${actorUserId})`;
    }
    await tx`update moderation_cases set status = 'RESOLVED', resolved_at = now() where id = ${caseId} and tenant_id = ${tenantId}`;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason, after_data)
      values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', ${`COMMENT_${action}`}, 'COMMENT', ${commentId}, ${randomUUID()}, ${justification},
        ${JSON.stringify({ caseId, action, notificationToAuthor: action !== 'KEEP' })}::jsonb)`;
  });
}

export type MemberNotification = { id: string; title: string; body: string; createdAt: Date };

export async function listUnreadMemberNotifications(tenantId: string, userId: string): Promise<MemberNotification[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      return tx<MemberNotification[]>`
        select id, payload->>'title' as title, payload->>'body' as body, created_at as "createdAt"
        from notifications
        where tenant_id = ${tenantId} and recipient_user_id = ${userId} and status = 'UNREAD'
          and notification_type = 'COMMENT_MODERATED'
        order by created_at asc limit 10
      `;
    });
  } finally { await sql.end(); }
}

export async function acknowledgeMemberNotification(tenantId: string, userId: string, notificationId: string) {
  await inTenant(tenantId, userId, async (tx) => {
    const changed = await tx<{ id: string }[]>`
      update notifications set status = 'READ', read_at = now()
      where id = ${notificationId} and tenant_id = ${tenantId} and recipient_user_id = ${userId} and status = 'UNREAD'
      returning id
    `;
    if (!changed[0]) throw new Error("Notificação indisponível.");
    await tx`update notification_deliveries set status = 'DELIVERED', delivered_at = coalesce(delivered_at, now()) where tenant_id = ${tenantId} and notification_id = ${notificationId} and channel = 'IN_APP'`;
  });
}

export type PublishedPoll = {
  id: string; title: string; summary: string | null; opensAt: Date; closesAt: Date;
  resultVisibility: "BEFORE_VOTE" | "AFTER_VOTE" | "AFTER_CLOSE" | "NEVER";
  hasVoted: boolean; showResults: boolean; options: Array<{ id: string; label: string; votes: number }>;
};

export async function listPublishedPolls(tenantId: string, viewerUserId?: string): Promise<PublishedPoll[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PUBLIC", tenantId });
      const polls = await tx<Array<{ id: string; title: string; summary: string | null; opensAt: Date; closesAt: Date; resultVisibility: PublishedPoll["resultVisibility"]; hasVoted: boolean; isClosed: boolean }>>`
        select content.id, content.title, content.summary, poll.opens_at as "opensAt", poll.closes_at as "closesAt",
          poll.result_visibility as "resultVisibility",
          false as "hasVoted",
          now() >= poll.closes_at as "isClosed"
        from tenants tenant
        join site_release_content release_content on release_content.tenant_id = tenant.id and release_content.release_id = tenant.current_release_id
        join content_items content on content.tenant_id = release_content.tenant_id and content.id = release_content.content_id
        join polls poll on poll.tenant_id = content.tenant_id and poll.content_id = content.id
        where tenant.id = ${tenantId} and release_content.content_type = 'POLL'
        order by poll.opens_at desc limit 20
      `;
      const result: PublishedPoll[] = [];
      for (const poll of polls) {
        const options = await tx<Array<{ id: string; label: string; votes: number }>>`
          select option_id as id, option_label as label, vote_count as votes
          from app.public_poll_results(${tenantId}, ${poll.id})
        `;
        let hasVoted = false;
        if (viewerUserId) {
          await setRlsContext(tx, { scope: "TENANT", tenantId, userId: viewerUserId });
          const ownVote = await tx<{ exists: boolean }[]>`
            select exists(select 1 from poll_votes where tenant_id = ${tenantId} and poll_id = ${poll.id} and user_id = ${viewerUserId}) as exists
          `;
          hasVoted = Boolean(ownVote[0]?.exists);
          await setRlsContext(tx, { scope: "PUBLIC", tenantId });
        }
        const showResults = poll.resultVisibility === "BEFORE_VOTE" || (poll.resultVisibility === "AFTER_VOTE" && hasVoted) || (poll.resultVisibility === "AFTER_CLOSE" && poll.isClosed);
        result.push({ id: poll.id, title: poll.title, summary: poll.summary, opensAt: poll.opensAt, closesAt: poll.closesAt, resultVisibility: poll.resultVisibility, hasVoted, showResults, options: showResults ? options : options.map((option) => ({ ...option, votes: 0 })) });
      }
      return result;
    });
  } finally { await sql.end(); }
}

export type PublishedNotice = { id: string; title: string; summary: string | null; occursAt: Date; targetUrl: string | null; happened: boolean };

export async function listPublishedNotices(tenantId: string): Promise<PublishedNotice[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PUBLIC", tenantId });
      return tx<PublishedNotice[]>`
        select content.id, content.title, content.summary, notice.occurs_at as "occursAt", notice.target_url as "targetUrl",
          (notice.occurs_at <= now()) as happened
        from tenants tenant
        join site_release_content release_content on release_content.tenant_id = tenant.id and release_content.release_id = tenant.current_release_id
        join content_items content on content.tenant_id = release_content.tenant_id and content.id = release_content.content_id
        join notices notice on notice.tenant_id = content.tenant_id and notice.content_id = content.id
        where tenant.id = ${tenantId} and release_content.content_type = 'NOTICE'
          and (content.unpublish_at is null or content.unpublish_at > now())
        order by notice.occurs_at asc limit 20
      `;
    });
  } finally { await sql.end(); }
}

export async function castPollVote(tenantId: string, userId: string, pollId: string, optionId: string) {
  await inTenant(tenantId, userId, async (tx) => {
    await ensureApprovedMember(tx, tenantId, userId);
    const options = await tx<{ opensAt: Date; closesAt: Date }[]>`
      select poll.opens_at as "opensAt", poll.closes_at as "closesAt"
      from polls poll join poll_options option on option.poll_id = poll.content_id and option.tenant_id = poll.tenant_id
      join tenants tenant on tenant.id = poll.tenant_id
      join site_release_content release_content on release_content.tenant_id = tenant.id
        and release_content.release_id = tenant.current_release_id and release_content.content_id = poll.content_id
      where poll.tenant_id = ${tenantId} and poll.content_id = ${pollId} and option.id = ${optionId} and option.status = 'ACTIVE'
      for update of poll, option
    `;
    const poll = options[0];
    if (!poll) throw new Error("A opção escolhida não pertence a esta enquete.");
    const now = new Date();
    if (now < poll.opensAt || now >= poll.closesAt) throw new Error("Esta enquete não está aberta para votação.");
    const vote = await tx<{ id: string }[]>`
      insert into poll_votes (id, tenant_id, poll_id, option_id, user_id)
      values (${randomUUID()}, ${tenantId}, ${pollId}, ${optionId}, ${userId})
      on conflict (tenant_id, poll_id, user_id) do nothing returning id
    `;
    if (!vote[0]) throw new Error("Seu voto já foi registrado e não pode ser alterado.");
    await tx`update poll_options set vote_count_cache = vote_count_cache + 1 where id = ${optionId} and tenant_id = ${tenantId}`;
    await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${tenantId}, ${userId}, 'USER', 'POLL_VOTED', 'POLL', ${pollId}, ${randomUUID()})`;
  });
}
