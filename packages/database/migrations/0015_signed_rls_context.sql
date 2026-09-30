-- Signed transaction context: arbitrary custom GUCs are caller-controlled and
-- therefore must never be an authorization source for RLS.
create table app.rls_context_keys (
  key_id text primary key,
  secret text not null check (length(secret) >= 32),
  allowed_scopes text[] not null check (cardinality(allowed_scopes) > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (allowed_scopes <@ array['PUBLIC','TENANT','PLATFORM','SYSTEM','REGISTRATION','TOKEN','PASSWORD_RESET']::text[])
);
revoke all on app.rls_context_keys from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'baixada_rls_verifier') then
    create role baixada_rls_verifier nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;
  end if;
end $$;
grant usage on schema app, public to baixada_rls_verifier;
grant select on app.rls_context_keys, public.users, public.tenant_memberships, public.platform_user_roles,
  public.roles, public.tenant_admin_invitations, public.guardian_confirmations, public.password_reset_tokens, public.tenants,
  public.poll_votes, public.polls, public.poll_options, public.site_release_content to baixada_rls_verifier;

create or replace function app.context_claims() returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, app
as $$
declare
  payload text;
  provided_signature text;
  claims jsonb;
  context_key text;
  scopes text[];
begin
  payload := current_setting('app.rls_context', true);
  provided_signature := current_setting('app.rls_context_signature', true);
  if payload is null or provided_signature is null then return null; end if;
  claims := payload::jsonb;
  if claims->>'v' <> '1' then return null; end if;
  if coalesce((claims->>'exp')::bigint, 0) <= extract(epoch from statement_timestamp())::bigint then return null; end if;
  select key.secret, key.allowed_scopes into context_key, scopes
  from app.rls_context_keys key
  where key.key_id = claims->>'kid' and key.enabled;
  if context_key is null or not ((claims->>'scope') = any(scopes)) then return null; end if;
  if encode(public.hmac(payload, context_key, 'sha256'), 'hex') <> lower(provided_signature) then return null; end if;
  if claims->>'scope' in ('TENANT','PLATFORM') and claims->>'userId' is null then return null; end if;
  if claims->>'scope' in ('PUBLIC','TENANT','REGISTRATION') and claims->>'tenantId' is null then return null; end if;
  if claims->>'scope' in ('TOKEN','PASSWORD_RESET') and claims->>'tokenHash' is null then return null; end if;
  if claims->>'scope' = 'SYSTEM' and claims->>'userId' is not null then return null; end if;
  if claims->>'scope' = 'PUBLIC' and (claims->>'userId' is not null or not exists (
    select 1 from public.tenants tenant where tenant.id = (claims->>'tenantId')::uuid and tenant.operational_status = 'ACTIVE'
  )) then return null; end if;
  if claims->>'scope' = 'TENANT' and not exists (
    select 1 from public.users account
    where account.id = (claims->>'userId')::uuid and account.global_status = 'ACTIVE'
      and ((claims->>'tenantId') is null or exists (
        select 1 from public.tenant_memberships membership
        where membership.user_id = account.id and membership.tenant_id = (claims->>'tenantId')::uuid and membership.status = 'APPROVED'
      ))
  ) then return null; end if;
  if claims->>'scope' = 'PLATFORM' and not exists (
    select 1 from public.users account
    join public.platform_user_roles platform_role on platform_role.user_id = account.id
    join public.roles role on role.id = platform_role.role_id and role.code = 'SUPERUSER'
    where account.id = (claims->>'userId')::uuid and account.global_status = 'ACTIVE'
  ) then return null; end if;
  if claims->>'scope' = 'REGISTRATION' and not exists (
    select 1 from public.users account join public.tenants tenant on tenant.id = (claims->>'tenantId')::uuid
    where account.id = (claims->>'userId')::uuid and account.global_status = 'ACTIVE' and tenant.operational_status = 'ACTIVE'
  ) then return null; end if;
  if claims->>'scope' = 'TOKEN' and not (
    exists (select 1 from public.guardian_confirmations confirmation where confirmation.token_hash = claims->>'tokenHash' and confirmation.expires_at > now())
    or exists (select 1 from public.tenant_admin_invitations invitation where invitation.token_hash = claims->>'tokenHash' and invitation.status in ('PENDING','ACCEPTED') and invitation.expires_at > now())
  ) then return null; end if;
  if claims->>'scope' = 'PASSWORD_RESET' and not exists (
    select 1 from public.password_reset_tokens token
    where token.token_hash = claims->>'tokenHash' and token.expires_at > now()
  ) then return null; end if;
  return claims;
exception when others then
  return null;
end $$;

alter function app.context_claims() owner to baixada_rls_verifier;

create or replace function app.resolve_public_tenant(hostname text)
returns table (id uuid, slug text, display_name text, legal_name text, operational_status text, billing_status text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select tenant.id, tenant.slug, tenant.display_name, tenant.legal_name, tenant.operational_status, tenant.billing_status
  from public.tenant_domains domain
  join public.tenants tenant on tenant.id = domain.tenant_id
  where lower(domain.hostname) = lower($1)
    and domain.is_canonical and domain.verification_status = 'VERIFIED' and domain.tls_status = 'ACTIVE'
    and tenant.operational_status = 'ACTIVE'
  limit 1
$$;
alter function app.resolve_public_tenant(text) owner to baixada_rls_verifier;

revoke all on function app.context_claims() from public;
revoke all on function app.resolve_public_tenant(text) from public;

create or replace function app.current_tenant_id() returns uuid
language sql stable as $$
  select nullif((select app.context_claims())->>'tenantId', '')::uuid
$$;

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif((select app.context_claims())->>'userId', '')::uuid
$$;

create or replace function app.current_context_scope() returns text
language sql stable as $$
  select (select app.context_claims())->>'scope'
$$;

create or replace function app.is_superuser() returns boolean
language sql stable as $$
  select coalesce((select app.current_context_scope()) = 'PLATFORM', false)
$$;

create or replace function app.is_system_context() returns boolean
language sql stable as $$
  select coalesce((select app.current_context_scope()) = 'SYSTEM', false)
$$;

create or replace function app.can_access_tenant_data() returns boolean
language sql stable as $$
  select coalesce((select app.current_context_scope()) in ('TENANT','PLATFORM','SYSTEM'), false)
$$;

create or replace function app.is_public_context() returns boolean
language sql stable as $$
  select coalesce((select app.current_context_scope()) = 'PUBLIC', false)
$$;

revoke all on function app.current_tenant_id() from public;
revoke all on function app.current_user_id() from public;
revoke all on function app.current_context_scope() from public;
revoke all on function app.is_superuser() from public;
revoke all on function app.is_system_context() from public;
revoke all on function app.can_access_tenant_data() from public;
revoke all on function app.is_public_context() from public;

do $$
declare
  table_name text;
  tenant_tables text[] := array[
    'tenant_memberships','membership_roles','membership_permission_overrides','tenant_admin_appointments',
    'guardian_confirmations','support_access_sessions','tenant_domains','tenant_domain_challenges','tenant_suspensions',
    'tenant_contracts','billing_charges','payments','payment_allocations','tenant_entitlement_overrides','tenant_usage_counters',
    'content_items','matches','agenda_events','polls','poll_options','comments','media_assets','media_variants',
    'media_processing_jobs','image_consents','media_consent_links','pages','page_versions','page_sections','section_columns',
    'page_blocks','site_releases','site_release_pages','menus','menu_versions','menu_items','site_release_menus','routes',
    'moderation_cases','moderation_appeals','data_subject_requests','data_erasure_reports','notifications',
    'notification_deliveries','storage_usage_events','quota_alerts','site_release_content',
    'registration_requests','contract_versions','tenant_status_history','notices','external_videos',
    'content_media_links','gallery_items','media_publication_authorizations','moderation_targets',
    'moderation_actions','data_erasure_operations','redirects','resource_references','tenant_theme_configs',
    'tenant_admin_invitations'
  ];
begin
  foreach table_name in array tenant_tables loop
    if to_regclass(format('public.%I', table_name)) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_policy', table_name);
    execute format(
      'create policy %I on public.%I for all using ((tenant_id = (select app.current_tenant_id()) and (select app.can_access_tenant_data())) or (select app.is_superuser()) or (select app.is_system_context())) with check ((tenant_id = (select app.current_tenant_id()) and (select app.can_access_tenant_data())) or (select app.is_superuser()) or (select app.is_system_context()))',
      table_name || '_signed_tenant_policy', table_name
    );
  end loop;
end $$;

-- Individual votes are private even to other members of the same tenant.
drop policy if exists poll_votes_tenant_policy on public.poll_votes;
create policy poll_votes_member_select_own on public.poll_votes for select
  using ((select app.current_context_scope()) = 'TENANT' and tenant_id = (select app.current_tenant_id())
    and user_id = (select app.current_user_id()));
create policy poll_votes_member_insert_own on public.poll_votes for insert
  with check ((select app.current_context_scope()) = 'TENANT' and tenant_id = (select app.current_tenant_id())
    and user_id = (select app.current_user_id()));
create policy poll_votes_platform_system_all on public.poll_votes for all
  using ((select app.is_superuser()) or (select app.is_system_context()))
  with check ((select app.is_superuser()) or (select app.is_system_context()));

create or replace function app.public_poll_results(p_tenant_id uuid, p_poll_id uuid)
returns table (option_id uuid, option_label text, vote_count integer)
language sql stable security definer
set search_path = pg_catalog, public, app
as $$
  select option.id, option.label, count(vote.id)::integer
  from public.polls poll
  join public.tenants tenant on tenant.id = poll.tenant_id and tenant.current_release_id is not null
  join public.site_release_content release_content on release_content.tenant_id = tenant.id
    and release_content.release_id = tenant.current_release_id and release_content.content_id = poll.content_id
    and release_content.content_type = 'POLL'
  join public.poll_options option on option.tenant_id = poll.tenant_id and option.poll_id = poll.content_id and option.status = 'ACTIVE'
  left join public.poll_votes vote on vote.tenant_id = option.tenant_id and vote.option_id = option.id
  where poll.tenant_id = p_tenant_id and poll.content_id = p_poll_id
    and app.is_public_context() and app.current_tenant_id() = p_tenant_id
  group by option.id, option.label, option.sort_order
  order by option.sort_order
$$;
alter function app.public_poll_results(uuid, uuid) owner to baixada_rls_verifier;
revoke all on function app.public_poll_results(uuid, uuid) from public;

-- Public page reads are intentionally SELECT-only and limited to published data
-- for the signed tenant. A PUBLIC context cannot read/write private tenant rows.
create policy content_items_public_select on public.content_items for select
  using ((select app.is_public_context()) and tenant_id = (select app.current_tenant_id())
    and editorial_status = 'PUBLISHED' and visibility = 'PUBLIC' and deleted_at is null
    and (unpublish_at is null or unpublish_at > now()));

create policy site_release_content_public_select on public.site_release_content for select
  using ((select app.is_public_context()) and tenant_id = (select app.current_tenant_id())
    and exists (select 1 from public.tenants tenant where tenant.id = site_release_content.tenant_id
      and tenant.current_release_id = site_release_content.release_id));

create policy tenant_theme_configs_public_select on public.tenant_theme_configs for select
  using ((select app.is_public_context()) and tenant_id = (select app.current_tenant_id()) and state = 'PUBLISHED');

create policy notices_public_select on public.notices for select
  using ((select app.is_public_context()) and tenant_id = (select app.current_tenant_id())
    and exists (select 1 from public.site_release_content release_content
      where release_content.tenant_id = notices.tenant_id and release_content.content_id = notices.content_id
        and release_content.content_type = 'NOTICE'));

create policy polls_public_select on public.polls for select
  using ((select app.is_public_context()) and tenant_id = (select app.current_tenant_id())
    and exists (select 1 from public.site_release_content release_content
      where release_content.tenant_id = polls.tenant_id and release_content.content_id = polls.content_id
        and release_content.content_type = 'POLL'));

create policy poll_options_public_select on public.poll_options for select
  using ((select app.is_public_context()) and tenant_id = (select app.current_tenant_id()) and status = 'ACTIVE'
    and exists (select 1 from public.site_release_content release_content
      where release_content.tenant_id = poll_options.tenant_id and release_content.content_id = poll_options.poll_id
        and release_content.content_type = 'POLL'));

create policy comments_public_select on public.comments for select
  using ((select app.is_public_context()) and tenant_id = (select app.current_tenant_id())
    and status = 'VISIBLE' and deleted_at is null
    and exists (select 1 from public.site_release_content release_content
      where release_content.tenant_id = comments.tenant_id and release_content.content_id = comments.content_id
        and coalesce((release_content.snapshot->>'commentsEnabled')::boolean, false)));

-- Registration and one-time-token flows receive narrow signed grants rather
-- than a global Superuser switch.
create policy tenant_memberships_registration_select on public.tenant_memberships for select
  using ((select app.current_context_scope()) = 'REGISTRATION'
    and tenant_id = (select app.current_tenant_id()) and user_id = (select app.current_user_id()));
create policy tenant_domains_registration_select on public.tenant_domains for select
  using ((select app.current_context_scope()) = 'REGISTRATION' and tenant_id = (select app.current_tenant_id())
    and is_canonical and verification_status = 'VERIFIED');
create policy tenant_memberships_registration_insert on public.tenant_memberships for insert
  with check ((select app.current_context_scope()) = 'REGISTRATION'
    and tenant_id = (select app.current_tenant_id()) and user_id = (select app.current_user_id()) and status = 'PENDING');

create policy tenant_memberships_self_select on public.tenant_memberships for select
  using ((select app.current_context_scope()) = 'TENANT' and user_id = (select app.current_user_id())
    and status = 'APPROVED');
create policy membership_roles_self_select on public.membership_roles for select
  using ((select app.current_context_scope()) = 'TENANT' and exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = membership_roles.tenant_id and membership.id = membership_roles.membership_id
      and membership.user_id = (select app.current_user_id()) and membership.status = 'APPROVED'));

create policy registration_requests_registration_insert on public.registration_requests for insert
  with check ((select app.current_context_scope()) = 'REGISTRATION' and tenant_id = (select app.current_tenant_id()));
create policy guardian_confirmations_registration_insert on public.guardian_confirmations for insert
  with check ((select app.current_context_scope()) = 'REGISTRATION' and tenant_id = (select app.current_tenant_id())
    and exists (select 1 from public.tenant_memberships membership where membership.tenant_id = guardian_confirmations.tenant_id
      and membership.id = guardian_confirmations.membership_id and membership.user_id = (select app.current_user_id())
      and membership.status = 'PENDING'));
create policy guardian_confirmations_token_access on public.guardian_confirmations for all
  using ((select app.current_context_scope()) = 'TOKEN' and token_hash = (select app.context_claims()->>'tokenHash'))
  with check ((select app.current_context_scope()) = 'TOKEN' and token_hash = (select app.context_claims()->>'tokenHash'));
create policy outbox_registration_insert on public.outbox_events for insert
  with check ((select app.current_context_scope()) = 'REGISTRATION' and tenant_id = (select app.current_tenant_id())
    and event_type = 'GUARDIAN_CONFIRMATION_REQUESTED');

create policy tenant_admin_invitation_token_access on public.tenant_admin_invitations for all
  using ((select app.current_context_scope()) = 'TOKEN' and token_hash = (select app.context_claims()->>'tokenHash'))
  with check ((select app.current_context_scope()) = 'TOKEN' and token_hash = (select app.context_claims()->>'tokenHash'));

create policy tenant_memberships_invitation_insert on public.tenant_memberships for insert
  with check ((select app.current_context_scope()) = 'TOKEN' and status = 'APPROVED'
    and exists (select 1 from public.tenant_admin_invitations invitation
      join public.users account on account.email_normalized = invitation.email_normalized
      where invitation.token_hash = (select app.context_claims()->>'tokenHash')
        and invitation.tenant_id = tenant_memberships.tenant_id and account.id = tenant_memberships.user_id
        and invitation.status = 'PENDING' and invitation.expires_at > now()));
create policy tenant_memberships_invitation_select on public.tenant_memberships for select
  using ((select app.current_context_scope()) = 'TOKEN' and exists (
    select 1 from public.tenant_admin_invitations invitation
    join public.users account on account.email_normalized = invitation.email_normalized
    where invitation.token_hash = (select app.context_claims()->>'tokenHash')
      and invitation.tenant_id = tenant_memberships.tenant_id and account.id = tenant_memberships.user_id));
create policy membership_roles_invitation_insert on public.membership_roles for insert
  with check ((select app.current_context_scope()) = 'TOKEN'
    and exists (select 1 from public.tenant_admin_invitations invitation
      join public.users account on account.email_normalized = invitation.email_normalized
      join public.tenant_memberships membership on membership.tenant_id = invitation.tenant_id and membership.user_id = account.id
      join public.roles role on role.id = membership_roles.role_id and role.code = 'ADMIN'
      where invitation.token_hash = (select app.context_claims()->>'tokenHash')
        and membership.id = membership_roles.membership_id and membership.tenant_id = membership_roles.tenant_id
        and invitation.status = 'PENDING' and invitation.expires_at > now()));

-- Audit history and email/media outbox rows also carry cross-tenant data.
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
create policy audit_events_signed_select on public.audit_events for select
  using ((tenant_id = (select app.current_tenant_id()) and (select app.current_context_scope()) in ('TENANT','PLATFORM','SYSTEM'))
    or ((select app.current_context_scope()) = 'PLATFORM' and tenant_id is null));
create policy audit_events_signed_insert on public.audit_events for insert
  with check (
    (tenant_id = (select app.current_tenant_id()) and (select app.current_context_scope()) in ('TENANT','PLATFORM')
      and actor_user_id = (select app.current_user_id()))
    or ((select app.current_context_scope()) = 'SYSTEM' and actor_type = 'SYSTEM')
    or ((select app.current_context_scope()) = 'REGISTRATION' and tenant_id = (select app.current_tenant_id())
      and actor_type = 'SYSTEM' and action = 'REGISTRATION_SUBMITTED')
    or ((select app.current_context_scope()) = 'TOKEN' and action = 'GUARDIAN_CONFIRMED' and actor_type = 'SYSTEM'
      and exists (select 1 from public.guardian_confirmations confirmation
        where confirmation.token_hash = (select app.context_claims()->>'tokenHash') and confirmation.id = resource_id))
    or ((select app.current_context_scope()) = 'TOKEN' and action = 'ADMIN_INVITATION_ACCEPTED'
      and exists (select 1 from public.tenant_admin_invitations invitation
        join public.users account on account.email_normalized = invitation.email_normalized
        join public.tenant_memberships membership on membership.tenant_id = invitation.tenant_id and membership.user_id = account.id
        where invitation.token_hash = (select app.context_claims()->>'tokenHash') and invitation.tenant_id = audit_events.tenant_id
          and membership.user_id = audit_events.actor_user_id and invitation.status = 'ACCEPTED'))
    or ((select app.current_context_scope()) = 'PASSWORD_RESET' and tenant_id is null
      and action = 'PASSWORD_RESET_COMPLETED' and actor_user_id = (select token.user_id from public.password_reset_tokens token
        where token.token_hash = (select app.context_claims()->>'tokenHash')))
    or ((select app.current_context_scope()) = 'PLATFORM' and tenant_id is null and actor_user_id = (select app.current_user_id()))
  );

alter table public.outbox_events enable row level security;
alter table public.outbox_events force row level security;
create policy outbox_system_all on public.outbox_events for all
  using ((select app.is_system_context())) with check ((select app.is_system_context()));
create policy outbox_media_insert on public.outbox_events for insert
  with check ((select app.current_context_scope()) = 'TENANT' and tenant_id = (select app.current_tenant_id())
    and event_type = 'MEDIA_PROCESSING_REQUESTED');
create policy outbox_admin_invitation_insert on public.outbox_events for insert
  with check ((select app.current_context_scope()) in ('TENANT','PLATFORM') and tenant_id = (select app.current_tenant_id())
    and event_type = 'ADMIN_INVITATION_REQUESTED');
create policy outbox_guardian_insert on public.outbox_events for insert
  with check ((select app.current_context_scope()) = 'REGISTRATION' and tenant_id = (select app.current_tenant_id())
    and event_type = 'GUARDIAN_CONFIRMATION_REQUESTED');
create policy outbox_password_reset_insert on public.outbox_events for insert
  with check ((select app.current_context_scope()) = 'PASSWORD_RESET' and tenant_id is null
    and event_type = 'PASSWORD_RESET_REQUESTED'
    and aggregate_id = (select token.user_id from public.password_reset_tokens token
      where token.token_hash = (select app.context_claims()->>'tokenHash') and token.consumed_at is null and token.expires_at > now()));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'baixada_runtime') then
    grant execute on function app.context_claims() to baixada_runtime;
    grant execute on function app.current_tenant_id() to baixada_runtime;
    grant execute on function app.current_user_id() to baixada_runtime;
    grant execute on function app.current_context_scope() to baixada_runtime;
    grant execute on function app.is_superuser() to baixada_runtime;
    grant execute on function app.is_system_context() to baixada_runtime;
    grant execute on function app.can_access_tenant_data() to baixada_runtime;
    grant execute on function app.is_public_context() to baixada_runtime;
    grant execute on function app.resolve_public_tenant(text) to baixada_runtime;
    grant execute on function app.public_poll_results(uuid, uuid) to baixada_runtime;
  end if;
end $$;
