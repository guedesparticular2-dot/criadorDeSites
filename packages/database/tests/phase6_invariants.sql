\set ON_ERROR_STOP on

begin;

insert into users (id, email, email_normalized, display_name, birth_date, global_status) values
  ('018f8100-0000-7000-8000-000000000001', 'phase6-admin@example.invalid', 'phase6-admin@example.invalid', 'Admin Fatia 6', '1990-01-01', 'ACTIVE'),
  ('018f8100-0000-7000-8000-000000000002', 'phase6-member@example.invalid', 'phase6-member@example.invalid', 'Membro Fatia 6', '1990-01-01', 'ACTIVE'),
  ('018f8100-0000-7000-8000-000000000003', 'phase6-suspended@example.invalid', 'phase6-suspended@example.invalid', 'Conta Suspensa Fatia 6', '1990-01-01', 'SUSPENDED');

insert into tenants (id, slug, legal_name, display_name) values
  ('018f8200-0000-7000-8000-000000000001', 'phase6-invariants', 'Phase 6 LTDA', 'Phase 6');

insert into tenant_memberships (id, tenant_id, user_id, relationship_text, status) values
  ('018f8300-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000001', 'Admin', 'APPROVED'),
  ('018f8300-0000-7000-8000-000000000002', '018f8200-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000002', 'Membro', 'APPROVED'),
  ('018f8300-0000-7000-8000-000000000003', '018f8200-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000003', 'Membro suspenso globalmente', 'APPROVED');

insert into content_items (id, tenant_id, content_type, title, slug, editorial_status, visibility, created_by, published_by, published_at, comments_enabled) values
  ('018f8400-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', 'NEWS', 'Notícia Fatia 6', 'noticia-phase6', 'PUBLISHED', 'PUBLIC', '018f8100-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000001', now(), true),
  ('018f8400-0000-7000-8000-000000000002', '018f8200-0000-7000-8000-000000000001', 'NOTICE', 'Aviso Fatia 6', 'aviso-phase6', 'PUBLISHED', 'PUBLIC', '018f8100-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000001', now(), false);

insert into site_releases (id, tenant_id, version, state, published_at, published_by) values
  ('018f8500-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', 1, 'PUBLISHED', now(), '018f8100-0000-7000-8000-000000000001');

update tenants set current_release_id = '018f8500-0000-7000-8000-000000000001'
where id = '018f8200-0000-7000-8000-000000000001';

insert into site_release_content (tenant_id, release_id, content_id, content_version, content_type, slug, snapshot) values
  ('018f8200-0000-7000-8000-000000000001', '018f8500-0000-7000-8000-000000000001', '018f8400-0000-7000-8000-000000000001', 1, 'NEWS', 'noticia-phase6', '{"commentsEnabled":true}'::jsonb),
  ('018f8200-0000-7000-8000-000000000001', '018f8500-0000-7000-8000-000000000001', '018f8400-0000-7000-8000-000000000002', 1, 'NOTICE', 'aviso-phase6', '{}'::jsonb);

insert into notices (tenant_id, content_id, occurs_at, event_phase) values
  ('018f8200-0000-7000-8000-000000000001', '018f8400-0000-7000-8000-000000000002', now() - interval '1 hour', 'HAPPENED');

insert into comments (id, tenant_id, content_id, user_id, body, status) values
  ('018f8600-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', '018f8400-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000002', 'Comentário visível enquanto a denúncia aguarda análise.', 'VISIBLE');

insert into moderation_cases (id, tenant_id, case_type, reporter_name, reporter_contact, reporter_user_id, reason, priority, status) values
  ('018f8700-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', 'COMMENT_REPORT', 'Membro Fatia 6', 'internal-user', '018f8100-0000-7000-8000-000000000002', 'Revisar o comentário.', 'HIGH', 'OPEN');

insert into moderation_targets (id, tenant_id, case_id, comment_id) values
  ('018f8800-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', '018f8700-0000-7000-8000-000000000001', '018f8600-0000-7000-8000-000000000001');

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from comments
  where tenant_id = '018f8200-0000-7000-8000-000000000001'
    and id = '018f8600-0000-7000-8000-000000000001' and status = 'VISIBLE' and deleted_at is null;
  if visible_count <> 1 then
    raise exception 'A denúncia não pode ocultar automaticamente o comentário.';
  end if;

  if exists (
    select 1 from tenant_memberships membership
    join users user_account on user_account.id = membership.user_id
    where membership.tenant_id = '018f8200-0000-7000-8000-000000000001'
      and membership.user_id = '018f8100-0000-7000-8000-000000000003'
      and membership.status = 'APPROVED' and user_account.global_status = 'ACTIVE'
  ) then
    raise exception 'Uma conta globalmente suspensa não pode participar, mesmo com vínculo aprovado.';
  end if;

  if not exists (
    select 1 from site_release_content release_content
    where release_content.tenant_id = '018f8200-0000-7000-8000-000000000001'
      and release_content.release_id = '018f8500-0000-7000-8000-000000000001'
      and release_content.content_id = '018f8400-0000-7000-8000-000000000002'
      and release_content.content_type = 'NOTICE'
  ) then
    raise exception 'Aviso não foi incluído na release publicada.';
  end if;
end $$;

insert into notifications (id, tenant_id, recipient_user_id, notification_type, dedupe_key, payload) values
  ('018f8900-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000001', 'COMMENT_REPORT', 'phase6-report-admin', '{"title":"Nova denúncia","body":"Há um comentário aguardando análise."}'::jsonb);

insert into notification_deliveries (id, tenant_id, notification_id, channel, status) values
  ('018f8a00-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', '018f8900-0000-7000-8000-000000000001', 'IN_APP', 'DELIVERED'),
  ('018f8a00-0000-7000-8000-000000000002', '018f8200-0000-7000-8000-000000000001', '018f8900-0000-7000-8000-000000000001', 'EMAIL', 'PENDING');

update comments set status = 'HIDDEN', moderated_by = '018f8100-0000-7000-8000-000000000001', moderated_at = now()
where tenant_id = '018f8200-0000-7000-8000-000000000001' and id = '018f8600-0000-7000-8000-000000000001';

update moderation_cases set status = 'RESOLVED', resolved_at = now()
where tenant_id = '018f8200-0000-7000-8000-000000000001' and id = '018f8700-0000-7000-8000-000000000001';

insert into moderation_actions (id, tenant_id, case_id, action, previous_state, new_state, justification, performed_by) values
  ('018f8b00-0000-7000-8000-000000000001', '018f8200-0000-7000-8000-000000000001', '018f8700-0000-7000-8000-000000000001', 'HIDE', 'VISIBLE', 'HIDDEN', 'Comentário viola as regras.', '018f8100-0000-7000-8000-000000000001');

insert into notifications (id, tenant_id, recipient_user_id, notification_type, dedupe_key, payload) values
  ('018f8900-0000-7000-8000-000000000002', '018f8200-0000-7000-8000-000000000001', '018f8100-0000-7000-8000-000000000002', 'COMMENT_MODERATED', 'phase6-comment-author', '{"title":"Comentário moderado","body":"Seu comentário foi ocultado por um moderador."}'::jsonb);

insert into notification_deliveries (id, tenant_id, notification_id, channel, status) values
  ('018f8a00-0000-7000-8000-000000000003', '018f8200-0000-7000-8000-000000000001', '018f8900-0000-7000-8000-000000000002', 'IN_APP', 'DELIVERED');

update notification_deliveries set status = 'FAILED', attempts = 1,
  last_error = 'Falha simulada de provedor.', available_at = now() + interval '2 minutes'
where tenant_id = '018f8200-0000-7000-8000-000000000001'
  and notification_id = '018f8900-0000-7000-8000-000000000001' and channel = 'EMAIL';

do $$
begin
  if not exists (
    select 1 from comments where tenant_id = '018f8200-0000-7000-8000-000000000001'
      and id = '018f8600-0000-7000-8000-000000000001' and status = 'HIDDEN'
  ) then raise exception 'A decisão de moderação não ocultou o comentário.'; end if;

  if not exists (
    select 1 from notifications notification
    join notification_deliveries delivery on delivery.tenant_id = notification.tenant_id and delivery.notification_id = notification.id
    where notification.tenant_id = '018f8200-0000-7000-8000-000000000001'
      and notification.recipient_user_id = '018f8100-0000-7000-8000-000000000002'
      and notification.notification_type = 'COMMENT_MODERATED'
      and notification.status = 'UNREAD' and delivery.channel = 'IN_APP' and delivery.status = 'DELIVERED'
  ) then raise exception 'A moderação deve gerar notificação persistente ao autor.'; end if;

  if not exists (
    select 1 from notification_deliveries
    where tenant_id = '018f8200-0000-7000-8000-000000000001'
      and notification_id = '018f8900-0000-7000-8000-000000000001'
      and channel = 'EMAIL' and status = 'FAILED' and attempts = 1 and available_at > now()
  ) then raise exception 'A falha de e-mail deve permanecer registrada para retentativa.'; end if;

  if not exists (
    select 1 from notices notice join content_items content on content.tenant_id = notice.tenant_id and content.id = notice.content_id
    where notice.tenant_id = '018f8200-0000-7000-8000-000000000001'
      and notice.content_id = '018f8400-0000-7000-8000-000000000002'
      and notice.occurs_at <= now() and (content.unpublish_at is null or content.unpublish_at > now())
  ) then raise exception 'Aviso ocorrido deve permanecer publicado até a expiração.'; end if;
end $$;

rollback;
