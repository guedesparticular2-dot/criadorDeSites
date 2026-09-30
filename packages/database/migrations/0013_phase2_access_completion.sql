-- Conclusão da Fatia 2: onboarding seguro, recuperação e mitigação de abuso.
create table auth_rate_limits (
  action text not null check (action in ('LOGIN', 'PASSWORD_RESET', 'MFA')),
  key_hash char(64) not null,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (action, key_hash)
);

create table tenant_admin_invitations (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  email_normalized text not null,
  invitee_name text not null,
  relationship_text text not null,
  token_hash text not null unique,
  invited_by uuid not null references users(id),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (expires_at > created_at)
);
create unique index tenant_admin_invitation_active_email_idx
  on tenant_admin_invitations (tenant_id, email_normalized) where status = 'PENDING';
create index tenant_admin_invitation_pending_idx
  on tenant_admin_invitations (tenant_id, expires_at, created_at) where status = 'PENDING';

create index password_reset_tokens_pending_idx
  on password_reset_tokens (user_id, expires_at) where consumed_at is null;

alter table outbox_events
  add column processing_started_at timestamptz null,
  add column dead_lettered_at timestamptz null;

create index outbox_reclaim_idx
  on outbox_events (processing_started_at, available_at, id)
  where processed_at is null and dead_lettered_at is null;

alter table tenant_admin_invitations enable row level security;
alter table tenant_admin_invitations force row level security;
create policy tenant_admin_invitations_tenant_policy on tenant_admin_invitations
  for all using (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser()))
  with check (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser()));
