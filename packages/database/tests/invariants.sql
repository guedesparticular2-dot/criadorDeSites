\set ON_ERROR_STOP on

begin;

insert into users (id, email, email_normalized, display_name, birth_date) values
  ('018f1100-0000-7000-8000-000000000001', 'admin@example.com', 'admin@example.com', 'Admin', '1990-01-01'),
  ('018f1100-0000-7000-8000-000000000002', 'voter@example.com', 'voter@example.com', 'Voter', '1990-01-01');

insert into tenants (id, slug, legal_name, display_name) values
  ('018f2100-0000-7000-8000-000000000001', 'invariant-tenant', 'Invariant LTDA', 'Invariant');

insert into tenant_memberships (id, tenant_id, user_id, relationship_text, status) values
  ('018f3100-0000-7000-8000-000000000001', '018f2100-0000-7000-8000-000000000001', '018f1100-0000-7000-8000-000000000001', 'Admin', 'APPROVED'),
  ('018f3100-0000-7000-8000-000000000002', '018f2100-0000-7000-8000-000000000001', '018f1100-0000-7000-8000-000000000002', 'Membro', 'APPROVED');

insert into tenant_admin_appointments (id, tenant_id, membership_id, kind, appointed_by, reason) values
  ('018f4100-0000-7000-8000-000000000001', '018f2100-0000-7000-8000-000000000001', '018f3100-0000-7000-8000-000000000001', 'PRIMARY_ADMIN', '018f1100-0000-7000-8000-000000000001', 'Provisionamento');

do $$
begin
  begin
    insert into tenant_admin_appointments (id, tenant_id, membership_id, kind, appointed_by, reason) values
      ('018f4100-0000-7000-8000-000000000002', '018f2100-0000-7000-8000-000000000001', '018f3100-0000-7000-8000-000000000002', 'PRIMARY_ADMIN', '018f1100-0000-7000-8000-000000000001', 'Duplicado');
    raise exception 'Expected unique primary admin violation';
  exception when unique_violation then
    null;
  end;
end $$;

insert into content_items (id, tenant_id, content_type, title, slug, created_by) values
  ('018f5100-0000-7000-8000-000000000001', '018f2100-0000-7000-8000-000000000001', 'POLL', 'Enquete', 'enquete', '018f1100-0000-7000-8000-000000000001');

insert into polls (tenant_id, content_id, opens_at, closes_at, result_visibility) values
  ('018f2100-0000-7000-8000-000000000001', '018f5100-0000-7000-8000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'AFTER_VOTE');

insert into poll_options (id, tenant_id, poll_id, label, sort_order) values
  ('018f6100-0000-7000-8000-000000000001', '018f2100-0000-7000-8000-000000000001', '018f5100-0000-7000-8000-000000000001', 'Opção A', 1),
  ('018f6100-0000-7000-8000-000000000002', '018f2100-0000-7000-8000-000000000001', '018f5100-0000-7000-8000-000000000001', 'Opção B', 2);

insert into poll_votes (id, tenant_id, poll_id, option_id, user_id) values
  ('018f7100-0000-7000-8000-000000000001', '018f2100-0000-7000-8000-000000000001', '018f5100-0000-7000-8000-000000000001', '018f6100-0000-7000-8000-000000000001', '018f1100-0000-7000-8000-000000000002');

do $$
begin
  begin
    insert into poll_votes (id, tenant_id, poll_id, option_id, user_id) values
      ('018f7100-0000-7000-8000-000000000002', '018f2100-0000-7000-8000-000000000001', '018f5100-0000-7000-8000-000000000001', '018f6100-0000-7000-8000-000000000002', '018f1100-0000-7000-8000-000000000002');
    raise exception 'Expected unique vote violation';
  exception when unique_violation then
    null;
  end;
end $$;

rollback;
