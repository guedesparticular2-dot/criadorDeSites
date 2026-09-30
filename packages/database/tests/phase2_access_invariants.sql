\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'baixada_test_runtime') then
    create role baixada_test_runtime nologin nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema public, app to baixada_test_runtime;
grant execute on function app.context_claims() to baixada_test_runtime;
grant execute on function app.current_tenant_id() to baixada_test_runtime;
grant execute on function app.current_user_id() to baixada_test_runtime;
grant execute on function app.current_context_scope() to baixada_test_runtime;
grant execute on function app.is_superuser() to baixada_test_runtime;
grant execute on function app.is_system_context() to baixada_test_runtime;
grant execute on function app.can_access_tenant_data() to baixada_test_runtime;
grant execute on function app.is_public_context() to baixada_test_runtime;
grant execute on function app.resolve_public_tenant(text) to baixada_test_runtime;
grant execute on function app.public_poll_results(uuid, uuid) to baixada_test_runtime;
grant select, insert, update, delete on all tables in schema public to baixada_test_runtime;

begin;

insert into users (id, email, email_normalized, display_name, birth_date) values
  ('018f1200-0000-7000-8000-000000000001', 'phase2-admin@example.test', 'phase2-admin@example.test', 'Admin Fatia 2', '1990-01-01'),
  ('018f1200-0000-7000-8000-000000000002', 'phase2-member@example.test', 'phase2-member@example.test', 'Membro Fatia 2', '1990-01-01');

insert into app.rls_context_keys (key_id, secret, allowed_scopes)
values ('phase2-test', 'abcdef0123456789abcdef0123456789', array['TENANT']);

insert into tenants (id, slug, legal_name, display_name) values
  ('018f2200-0000-7000-8000-000000000001', 'phase2-a', 'Fatia 2 A LTDA', 'Fatia 2 A'),
  ('018f2200-0000-7000-8000-000000000002', 'phase2-b', 'Fatia 2 B LTDA', 'Fatia 2 B');

insert into tenant_memberships (id, tenant_id, user_id, status, relationship_text) values
  ('018f3200-0000-7000-8000-000000000001', '018f2200-0000-7000-8000-000000000001', '018f1200-0000-7000-8000-000000000001', 'APPROVED', 'Administrador'),
  ('018f3200-0000-7000-8000-000000000002', '018f2200-0000-7000-8000-000000000001', '018f1200-0000-7000-8000-000000000002', 'APPROVED', 'Membro');

insert into tenant_admin_invitations (id, tenant_id, email_normalized, invitee_name, relationship_text, token_hash, invited_by, expires_at) values
  ('018f4200-0000-7000-8000-000000000001', '018f2200-0000-7000-8000-000000000001', 'invitee@example.test', 'Convidado', 'Comunicação', repeat('a', 64), '018f1200-0000-7000-8000-000000000001', now() + interval '7 days');

set local role baixada_test_runtime;
with payload as (
  select jsonb_build_object('v',1,'kid','phase2-test','tenantId','018f2200-0000-7000-8000-000000000001',
    'userId','018f1200-0000-7000-8000-000000000001','tokenHash',null,'scope','TENANT',
    'exp',extract(epoch from now())::bigint + 120)::text as value
), signed as (select value, encode(public.hmac(value, 'abcdef0123456789abcdef0123456789', 'sha256'), 'hex') as signature from payload)
select set_config('app.rls_context', value, true), set_config('app.rls_context_signature', signature, true) from signed;

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from tenant_admin_invitations;
  if visible_count <> 1 then raise exception 'Tenant A should see its own invitation, found %', visible_count; end if;
end $$;

with payload as (
  select jsonb_build_object('v',1,'kid','phase2-test','tenantId','018f2200-0000-7000-8000-000000000002',
    'userId','018f1200-0000-7000-8000-000000000001','tokenHash',null,'scope','TENANT',
    'exp',extract(epoch from now())::bigint + 120)::text as value
), signed as (select value, encode(public.hmac(value, 'abcdef0123456789abcdef0123456789', 'sha256'), 'hex') as signature from payload)
select set_config('app.rls_context', value, true), set_config('app.rls_context_signature', signature, true) from signed;
do $$
declare visible_count integer;
begin
  select count(*) into visible_count from tenant_admin_invitations;
  if visible_count <> 0 then raise exception 'Tenant B read another tenant invitation, found %', visible_count; end if;
end $$;

with payload as (
  select jsonb_build_object('v',1,'kid','phase2-test','tenantId','018f2200-0000-7000-8000-000000000001',
    'userId','018f1200-0000-7000-8000-000000000001','tokenHash',null,'scope','TENANT',
    'exp',extract(epoch from now())::bigint + 120)::text as value
), signed as (select value, encode(public.hmac(value, 'abcdef0123456789abcdef0123456789', 'sha256'), 'hex') as signature from payload)
select set_config('app.rls_context', value, true), set_config('app.rls_context_signature', signature, true) from signed;
do $$
begin
  begin
    insert into tenant_admin_invitations (id, tenant_id, email_normalized, invitee_name, relationship_text, token_hash, invited_by, expires_at)
    values ('018f4200-0000-7000-8000-000000000002', '018f2200-0000-7000-8000-000000000001', 'invitee@example.test', 'Outro convite', 'Comunicação', repeat('b', 64), '018f1200-0000-7000-8000-000000000001', now() + interval '7 days');
    raise exception 'Expected one pending administrator invitation per email and tenant';
  exception when unique_violation then null;
  end;
end $$;

reset role;
insert into auth_rate_limits (action, key_hash, attempts) values ('LOGIN', repeat('c', 64), 1);
insert into auth_rate_limits (action, key_hash, attempts) values ('REGISTRATION', repeat('e', 64), 1);
insert into auth_rate_limits (action, key_hash, attempts) values ('ADMIN_INVITE', repeat('f', 64), 1);
do $$
begin
  begin
    insert into auth_rate_limits (action, key_hash, attempts) values ('INVALID', repeat('d', 64), 1);
    raise exception 'Expected auth rate-limit action constraint';
  exception when check_violation then null;
  end;
end $$;

rollback;
