-- A escolha de tenant é uma leitura global, porém limitada às associações do
-- usuário autenticado. Depois da escolha, as políticas tenant-scoped continuam
-- sendo a segunda barreira para toda a operação.
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

drop policy if exists tenant_memberships_tenant_policy on tenant_memberships;
create policy tenant_memberships_tenant_policy on tenant_memberships
  for all using (
    tenant_id = (select app.current_tenant_id())
    or user_id = (select app.current_user_id())
    or (select app.is_superuser())
  ) with check (
    tenant_id = (select app.current_tenant_id())
    or (select app.is_superuser())
  );

drop policy if exists membership_roles_tenant_policy on membership_roles;
create policy membership_roles_tenant_policy on membership_roles
  for all using (
    tenant_id = (select app.current_tenant_id())
    or (select app.is_superuser())
    or exists (
      select 1 from tenant_memberships membership
      where membership.id = membership_roles.membership_id
        and membership.user_id = (select app.current_user_id())
    )
  ) with check (
    tenant_id = (select app.current_tenant_id())
    or (select app.is_superuser())
  );
