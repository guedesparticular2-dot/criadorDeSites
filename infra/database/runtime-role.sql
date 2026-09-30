-- Execute as a database administrator. The login used by the application should
-- be a member of this role and must never receive SUPERUSER or BYPASSRLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'baixada_runtime') then
    create role baixada_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'baixada_rls_verifier') then
    create role baixada_rls_verifier nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;
  end if;
end $$;

grant usage on schema public, app to baixada_runtime;
grant usage on schema public, app to baixada_rls_verifier;
grant execute on function app.current_tenant_id() to baixada_runtime;
grant execute on function app.current_user_id() to baixada_runtime;
grant execute on function app.current_context_scope() to baixada_runtime;
grant execute on function app.is_superuser() to baixada_runtime;
grant execute on function app.is_system_context() to baixada_runtime;
grant execute on function app.can_access_tenant_data() to baixada_runtime;
grant execute on function app.is_public_context() to baixada_runtime;
grant execute on function app.context_claims() to baixada_runtime;
grant select, insert, update, delete on all tables in schema public to baixada_runtime;
grant usage, select on all sequences in schema public to baixada_runtime;
alter default privileges for role baixada_owner in schema public
  grant select, insert, update, delete on tables to baixada_runtime;
alter default privileges for role baixada_owner in schema public
  grant usage, select on sequences to baixada_runtime;
grant select on app.rls_context_keys, users, tenant_memberships, platform_user_roles, roles,
  tenant_admin_invitations, guardian_confirmations, tenants to baixada_rls_verifier;

revoke update, delete on audit_events, storage_usage_events from baixada_runtime;
revoke update, delete on data_erasure_reports from baixada_runtime;
