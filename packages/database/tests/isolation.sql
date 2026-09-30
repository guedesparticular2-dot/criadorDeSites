\set ON_ERROR_STOP on

begin;

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
grant select, insert, update, delete on all tables in schema public to baixada_test_runtime;

insert into app.rls_context_keys (key_id, secret, allowed_scopes)
values ('isolation-test', '0123456789abcdef0123456789abcdef', array['PUBLIC','TENANT','PLATFORM']);

insert into users (id, email, email_normalized, display_name, birth_date) values
  ('018f1000-0000-7000-8000-000000000001', 'a@example.com', 'a@example.com', 'Usuário A', '1990-01-01'),
  ('018f1000-0000-7000-8000-000000000002', 'b@example.com', 'b@example.com', 'Usuário B', '1990-01-01');

insert into tenants (id, slug, legal_name, display_name, operational_status, billing_status) values
  ('018f2000-0000-7000-8000-000000000001', 'tenant-a', 'Tenant A LTDA', 'Tenant A', 'ACTIVE', 'ACTIVE'),
  ('018f2000-0000-7000-8000-000000000002', 'tenant-b', 'Tenant B LTDA', 'Tenant B', 'ACTIVE', 'ACTIVE');

insert into tenant_memberships (id, tenant_id, user_id, status, relationship_text) values
  ('018f3000-0000-7000-8000-000000000001', '018f2000-0000-7000-8000-000000000001', '018f1000-0000-7000-8000-000000000001', 'APPROVED', 'Responsável'),
  ('018f3000-0000-7000-8000-000000000002', '018f2000-0000-7000-8000-000000000002', '018f1000-0000-7000-8000-000000000002', 'APPROVED', 'Atleta');

insert into content_items (id, tenant_id, content_type, title, slug, body, editorial_status, visibility, author_display, created_by, published_at)
values
  ('018f4000-0000-7000-8000-000000000001', '018f2000-0000-7000-8000-000000000001', 'NEWS', 'Conteúdo público A', 'publico-a', '{}', 'PUBLISHED', 'PUBLIC', 'A', '018f1000-0000-7000-8000-000000000001', now()),
  ('018f4000-0000-7000-8000-000000000002', '018f2000-0000-7000-8000-000000000002', 'NEWS', 'Conteúdo público B', 'publico-b', '{}', 'PUBLISHED', 'PUBLIC', 'B', '018f1000-0000-7000-8000-000000000002', now());

set local role baixada_test_runtime;

-- A valid signed tenant context sees only tenant A.
with payload as (
  select jsonb_build_object('v',1,'kid','isolation-test','tenantId','018f2000-0000-7000-8000-000000000001',
    'userId','018f1000-0000-7000-8000-000000000001','tokenHash',null,'scope','TENANT',
    'exp',extract(epoch from now())::bigint + 120)::text as value
), signed as (
  select value, encode(public.hmac(value, '0123456789abcdef0123456789abcdef', 'sha256'), 'hex') as signature from payload
)
select set_config('app.rls_context', value, true), set_config('app.rls_context_signature', signature, true) from signed;

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from tenant_memberships;
  if visible_count <> 1 then raise exception 'Signed tenant A should see exactly one membership; found %', visible_count; end if;
end $$;

-- Changing either legacy GUC must not change the signed authorization context.
select set_config('app.tenant_id', '018f2000-0000-7000-8000-000000000002', true);
select set_config('app.is_superuser', 'true', true);
do $$
declare visible_count integer;
begin
  if app.current_tenant_id() <> '018f2000-0000-7000-8000-000000000001'::uuid then
    raise exception 'RLS context forgery: runtime changed the effective tenant';
  end if;
  if app.is_superuser() then raise exception 'RLS context forgery: runtime promoted itself to Superuser'; end if;
  select count(*) into visible_count from tenant_memberships;
  if visible_count <> 1 then raise exception 'Changing legacy GUCs exposed % memberships; expected 1', visible_count; end if;
end $$;

-- Even the trusted signer cannot bind user A to tenant B unless the user has
-- an approved membership there; the verifier checks database authorization.
with payload as (
  select jsonb_build_object('v',1,'kid','isolation-test','tenantId','018f2000-0000-7000-8000-000000000002',
    'userId','018f1000-0000-7000-8000-000000000001','tokenHash',null,'scope','TENANT',
    'exp',extract(epoch from now())::bigint + 120)::text as value
), signed as (
  select value, encode(public.hmac(value, '0123456789abcdef0123456789abcdef', 'sha256'), 'hex') as signature from payload
)
select set_config('app.rls_context', value, true), set_config('app.rls_context_signature', signature, true) from signed;
do $$
declare visible_count integer;
begin
  if app.current_tenant_id() is not null then raise exception 'User A was bound to unauthorized tenant B'; end if;
  select count(*) into visible_count from tenant_memberships;
  if visible_count <> 0 then raise exception 'Unauthorized signed context exposed % memberships', visible_count; end if;
end $$;

-- A well-formed, correctly signed PLATFORM claim is still rejected for a
-- normal user without a SUPERUSER platform role.
with payload as (
  select jsonb_build_object('v',1,'kid','isolation-test','tenantId','018f2000-0000-7000-8000-000000000002',
    'userId','018f1000-0000-7000-8000-000000000002','tokenHash',null,'scope','PLATFORM',
    'exp',extract(epoch from now())::bigint + 120)::text as value
), signed as (
  select value, encode(public.hmac(value, '0123456789abcdef0123456789abcdef', 'sha256'), 'hex') as signature from payload
)
select set_config('app.rls_context', value, true), set_config('app.rls_context_signature', signature, true) from signed;
do $$
begin
  if app.current_tenant_id() is not null or app.is_superuser() then
    raise exception 'A valid signature promoted an ordinary user to PLATFORM';
  end if;
end $$;

-- Replacing the claims while replaying tenant A's signature invalidates context.
select set_config('app.rls_context', '{"v":1,"kid":"isolation-test","tenantId":"018f2000-0000-7000-8000-000000000002","userId":"018f1000-0000-7000-8000-000000000002","tokenHash":null,"scope":"PLATFORM","exp":9999999999}', true);
do $$
declare visible_count integer;
begin
  if app.current_tenant_id() is not null or app.is_superuser() then raise exception 'Forged signed claims were accepted'; end if;
  select count(*) into visible_count from tenant_memberships;
  if visible_count <> 0 then raise exception 'Invalid signature exposed % membership rows', visible_count; end if;
end $$;

-- A valid public context is read-only and cannot inspect private membership rows.
with payload as (
  select jsonb_build_object('v',1,'kid','isolation-test','tenantId','018f2000-0000-7000-8000-000000000001',
    'userId',null,'tokenHash',null,'scope','PUBLIC','exp',extract(epoch from now())::bigint + 120)::text as value
), signed as (
  select value, encode(public.hmac(value, '0123456789abcdef0123456789abcdef', 'sha256'), 'hex') as signature from payload
)
select set_config('app.rls_context', value, true), set_config('app.rls_context_signature', signature, true) from signed;

do $$
declare private_count integer; public_count integer;
begin
  select count(*) into private_count from tenant_memberships;
  select count(*) into public_count from content_items;
  if private_count <> 0 then raise exception 'Public context exposed % private memberships', private_count; end if;
  if public_count <> 1 then
    raise exception 'Public context should see only tenant A public content; found %, valid scope %, tenant %',
      public_count, app.current_context_scope(), app.current_tenant_id();
  end if;
  begin
    insert into tenant_memberships (id, tenant_id, user_id, relationship_text)
    values ('018f3000-0000-7000-8000-000000000003', '018f2000-0000-7000-8000-000000000001', '018f1000-0000-7000-8000-000000000001', 'forged');
    raise exception 'Public context unexpectedly wrote a tenant membership';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
