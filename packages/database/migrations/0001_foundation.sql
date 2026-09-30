create extension if not exists pgcrypto;
create schema if not exists app;

create or replace function app.current_tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function app.is_superuser() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('app.is_superuser', true), '')::boolean, false)
$$;

create table plans (
  id uuid primary key,
  code text not null unique check (code in ('SIMPLE', 'MEDIUM', 'UNLIMITED')),
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plan_entitlements (
  plan_id uuid not null references plans(id),
  feature_code text not null,
  limit_value numeric null,
  enforcement text not null default 'SOFT' check (enforcement in ('SOFT', 'HARD', 'INFORMATIONAL')),
  config jsonb not null default '{}'::jsonb,
  primary key (plan_id, feature_code)
);

create table users (
  id uuid primary key,
  email text not null,
  email_normalized text not null unique,
  display_name text not null,
  birth_date date not null,
  global_status text not null default 'ACTIVE' check (global_status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
  email_verified_at timestamptz null,
  mfa_required boolean not null default false,
  mfa_enabled_at timestamptz null,
  last_login_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table user_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  password_hash text not null,
  password_changed_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz null
);

create table tenants (
  id uuid primary key,
  slug text not null unique,
  legal_name text not null,
  display_name text not null,
  operational_status text not null default 'CONFIGURING' check (operational_status in ('CONFIGURING', 'ACTIVE', 'SCHEDULED_SUSPENSION', 'SUSPENDED', 'CLOSED')),
  billing_status text not null default 'NOT_CONFIGURED' check (billing_status in ('NOT_CONFIGURED', 'ACTIVE', 'OVERDUE', 'SUSPENDED', 'CLOSED')),
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  default_currency char(3) not null default 'BRL' check (default_currency = 'BRL'),
  current_release_id uuid null,
  provisioned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  unique (id, slug)
);

create table tenant_memberships (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ENDED')),
  relationship_text text not null,
  approved_at timestamptz null,
  approved_by uuid null references users(id),
  suspended_at timestamptz null,
  suspended_by uuid null references users(id),
  rejection_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id)
);

create table roles (
  id uuid primary key,
  code text not null unique check (code in ('SUPERUSER', 'PRIMARY_ADMIN', 'ADMIN', 'USER')),
  name text not null,
  scope text not null check (scope in ('PLATFORM', 'TENANT')),
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key,
  code text not null unique,
  module text not null,
  description text not null
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table membership_roles (
  tenant_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null references roles(id),
  granted_by uuid null references users(id),
  granted_at timestamptz not null default now(),
  primary key (membership_id, role_id),
  foreign key (tenant_id, membership_id) references tenant_memberships(tenant_id, id)
);

create table membership_permission_overrides (
  tenant_id uuid not null,
  membership_id uuid not null,
  permission_id uuid not null references permissions(id),
  effect text not null check (effect in ('ALLOW', 'DENY')),
  changed_by uuid not null references users(id),
  changed_at timestamptz not null default now(),
  primary key (membership_id, permission_id),
  foreign key (tenant_id, membership_id) references tenant_memberships(tenant_id, id)
);

create table tenant_admin_appointments (
  id uuid primary key,
  tenant_id uuid not null,
  membership_id uuid not null,
  kind text not null check (kind = 'PRIMARY_ADMIN'),
  valid_from timestamptz not null default now(),
  valid_until timestamptz null,
  appointed_by uuid not null references users(id),
  reason text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, membership_id) references tenant_memberships(tenant_id, id)
);
create unique index tenant_one_active_primary_admin_idx on tenant_admin_appointments (tenant_id) where valid_until is null;

create table guardian_confirmations (
  id uuid primary key,
  tenant_id uuid not null,
  membership_id uuid not null,
  guardian_name text not null,
  guardian_email text not null,
  token_hash text not null unique,
  terms_version text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'EXPIRED', 'REVOKED')),
  expires_at timestamptz not null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, membership_id) references tenant_memberships(tenant_id, id)
);

create table auth_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  is_administrative boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  ip inet null,
  user_agent text null,
  check (expires_at > created_at)
);

create table support_access_sessions (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  superuser_id uuid not null references users(id),
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  request_id text not null,
  unique (tenant_id, id)
);

create table tenant_domains (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  hostname text not null,
  kind text not null check (kind in ('PLATFORM_SUBDOMAIN', 'CUSTOM')),
  is_canonical boolean not null default false,
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING', 'VERIFIED', 'FAILED')),
  tls_status text not null default 'PENDING' check (tls_status in ('PENDING', 'ACTIVE', 'FAILED')),
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index tenant_domains_hostname_idx on tenant_domains (lower(hostname));
create unique index tenant_one_canonical_domain_idx on tenant_domains (tenant_id) where is_canonical;

create table tenant_domain_challenges (
  id uuid primary key,
  tenant_id uuid not null,
  domain_id uuid not null,
  method text not null check (method in ('DNS_TXT', 'HTTP_FILE')),
  token_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, domain_id) references tenant_domains(tenant_id, id)
);

create table tenant_suspensions (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  kind text not null check (kind in ('COMMERCIAL', 'OPERATIONAL', 'SECURITY')),
  reason text not null,
  public_message text not null,
  block_public_access boolean not null default true,
  block_member_login boolean not null default true,
  allow_limited_admin_access boolean not null default true,
  block_publication boolean not null default true,
  grace_period_days integer not null default 10 check (grace_period_days >= 0),
  automatic boolean not null default false,
  scheduled_for timestamptz null,
  started_at timestamptz null,
  ended_at timestamptz null,
  created_by uuid null references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table tenant_contracts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  plan_id uuid not null references plans(id),
  status text not null check (status in ('DRAFT', 'ACTIVE', 'ENDED')),
  start_date date not null,
  end_date date null,
  billing_frequency text not null check (billing_frequency in ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
  contracted_amount numeric(14,2) not null check (contracted_amount >= 0),
  recurring_amount numeric(14,2) not null check (recurring_amount >= 0),
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  next_due_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table billing_charges (
  id uuid primary key,
  tenant_id uuid not null,
  contract_id uuid not null,
  reference_period date not null,
  due_date date not null,
  expected_amount numeric(14,2) not null check (expected_amount >= 0),
  charged_amount numeric(14,2) not null check (charged_amount >= 0),
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  status text not null check (status in ('OPEN', 'PAID', 'OVERDUE', 'CANCELLED')),
  notes text null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, contract_id, reference_period),
  foreign key (tenant_id, contract_id) references tenant_contracts(tenant_id, id)
);

create table payments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  paid_at timestamptz not null,
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  method text not null check (method in ('PIX', 'BOLETO', 'TRANSFER', 'CARD')),
  external_reference text null,
  evidence_path text null,
  status text not null check (status in ('CONFIRMED', 'REVERSED')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table payment_allocations (
  tenant_id uuid not null,
  payment_id uuid not null,
  charge_id uuid not null,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  primary key (payment_id, charge_id),
  foreign key (tenant_id, payment_id) references payments(tenant_id, id),
  foreign key (tenant_id, charge_id) references billing_charges(tenant_id, id)
);

create table tenant_entitlement_overrides (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  feature_code text not null,
  limit_value numeric null,
  valid_until timestamptz null,
  reason text not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, feature_code)
);

create table tenant_usage_counters (
  tenant_id uuid primary key references tenants(id),
  active_users bigint not null default 0,
  published_pages bigint not null default 0,
  storage_bytes bigint not null default 0,
  calculated_at timestamptz not null default now(),
  check (active_users >= 0 and published_pages >= 0 and storage_bytes >= 0)
);

create table content_items (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  content_type text not null check (content_type in ('NEWS', 'HIGHLIGHT', 'EVENT', 'MATCH', 'GALLERY', 'POLL', 'NOTICE')),
  title text not null,
  slug text not null,
  summary text null,
  body jsonb not null default '{}'::jsonb,
  editorial_status text not null default 'DRAFT' check (editorial_status in ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'TRASH')),
  visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC', 'RESTRICTED', 'HIDDEN')),
  author_display text null,
  created_by uuid not null references users(id),
  published_by uuid null references users(id),
  publish_at timestamptz null,
  published_at timestamptz null,
  unpublish_at timestamptz null,
  comments_enabled boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (tenant_id, id)
);
create unique index content_active_slug_idx on content_items (tenant_id, slug) where deleted_at is null;
create index content_public_listing_idx on content_items (tenant_id, content_type, published_at desc, id) where editorial_status = 'PUBLISHED' and visibility = 'PUBLIC' and deleted_at is null;

create table matches (
  tenant_id uuid not null,
  content_id uuid primary key,
  starts_at timestamptz not null,
  opponent_name text not null,
  competition text null,
  round text null,
  location text null,
  home_or_away text not null check (home_or_away in ('HOME', 'AWAY', 'NEUTRAL')),
  our_score smallint null check (our_score >= 0),
  opponent_score smallint null check (opponent_score >= 0),
  match_status text not null check (match_status in ('SCHEDULED', 'POSTPONED', 'CANCELLED', 'IN_PROGRESS', 'FINISHED')),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id)
);

create table agenda_events (
  tenant_id uuid not null,
  content_id uuid primary key,
  event_kind text not null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  location text null,
  operational_status text not null check (operational_status in ('SCHEDULED', 'POSTPONED', 'CANCELLED', 'COMPLETED')),
  related_match_id uuid null,
  foreign key (tenant_id, content_id) references content_items(tenant_id, id),
  foreign key (tenant_id, related_match_id) references content_items(tenant_id, id)
);

create table polls (
  tenant_id uuid not null,
  content_id uuid primary key,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  result_visibility text not null check (result_visibility in ('BEFORE_VOTE', 'AFTER_VOTE', 'AFTER_CLOSE', 'NEVER')),
  selection_mode text not null default 'SINGLE' check (selection_mode = 'SINGLE'),
  allow_vote_change boolean not null default false check (allow_vote_change = false),
  check (closes_at > opens_at),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id)
);

create table poll_options (
  id uuid primary key,
  tenant_id uuid not null,
  poll_id uuid not null,
  label text not null,
  sort_order integer not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RETIRED')),
  vote_count_cache bigint not null default 0,
  unique (tenant_id, id),
  unique (poll_id, sort_order),
  foreign key (tenant_id, poll_id) references content_items(tenant_id, id)
);

create table poll_votes (
  id uuid primary key,
  tenant_id uuid not null,
  poll_id uuid not null,
  option_id uuid not null,
  user_id uuid not null references users(id),
  voted_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, poll_id, user_id),
  foreign key (tenant_id, poll_id) references content_items(tenant_id, id),
  foreign key (tenant_id, option_id) references poll_options(tenant_id, id)
);

create table comments (
  id uuid primary key,
  tenant_id uuid not null,
  content_id uuid not null,
  user_id uuid not null references users(id),
  parent_id uuid null,
  body text not null,
  status text not null default 'VISIBLE' check (status in ('VISIBLE', 'HIDDEN', 'REMOVED')),
  moderated_by uuid null references users(id),
  moderated_at timestamptz null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (tenant_id, id),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id),
  foreign key (tenant_id, parent_id) references comments(tenant_id, id)
);

create table media_assets (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  asset_stage text not null check (asset_stage in ('TEMPORARY_ORIGINAL', 'DERIVED', 'PUBLISHED')),
  object_path text not null,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  sha256 char(64) not null,
  width integer null check (width > 0),
  height integer null check (height > 0),
  processing_status text not null default 'PENDING' check (processing_status in ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  visibility text not null default 'HIDDEN' check (visibility in ('PUBLIC', 'RESTRICTED', 'HIDDEN')),
  alt_text text null,
  focal_point jsonb null,
  uploaded_by uuid not null references users(id),
  approved_at timestamptz null,
  approved_by uuid null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (tenant_id, id),
  unique (tenant_id, object_path)
);

create table media_variants (
  id uuid primary key,
  tenant_id uuid not null,
  media_id uuid not null,
  variant_code text not null,
  object_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  width integer not null,
  height integer not null,
  processing_status text not null check (processing_status in ('PENDING', 'READY', 'FAILED')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (media_id, variant_code),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id)
);

create table media_processing_jobs (
  id uuid primary key,
  tenant_id uuid not null,
  media_id uuid not null,
  idempotency_key text not null,
  job_type text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  last_error text null,
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id)
);

create table image_consents (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  subject_reference text not null,
  guardian_name text null,
  guardian_email text null,
  external_document_reference text not null,
  scope text not null,
  valid_from date not null,
  valid_until date null,
  revoked_at timestamptz null,
  revocation_reason text null,
  recorded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table media_consent_links (
  tenant_id uuid not null,
  media_id uuid not null,
  consent_id uuid not null,
  primary key (media_id, consent_id),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id),
  foreign key (tenant_id, consent_id) references image_consents(tenant_id, id)
);

create table pages (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  page_type text not null check (page_type in ('INSTITUTIONAL', 'CONTACT', 'NEWS_LIST', 'CONTENT_DETAIL', 'LANDING')),
  creation_mode text not null check (creation_mode in ('TEMPLATE', 'BLANK', 'DUPLICATE')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (tenant_id, id)
);

create table page_versions (
  id uuid primary key,
  tenant_id uuid not null,
  page_id uuid not null,
  version integer not null check (version > 0),
  title text not null,
  slug text not null,
  parent_page_id uuid null,
  visibility text not null check (visibility in ('PUBLIC', 'RESTRICTED', 'HIDDEN')),
  indexing_policy text not null check (indexing_policy in ('INDEX', 'NOINDEX')),
  header_mode text not null check (header_mode in ('REQUIRED', 'INHERITED', 'HIDDEN')),
  header_config jsonb not null default '{}'::jsonb,
  state text not null check (state in ('DRAFT', 'READY', 'PUBLISHED', 'SUPERSEDED')),
  based_on_version_id uuid null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (page_id, version),
  foreign key (tenant_id, page_id) references pages(tenant_id, id),
  foreign key (tenant_id, parent_page_id) references pages(tenant_id, id),
  foreign key (tenant_id, based_on_version_id) references page_versions(tenant_id, id)
);

create table layout_definitions (
  id uuid primary key,
  code text not null unique,
  name text not null,
  column_schema jsonb not null,
  responsive_rules jsonb not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE'))
);

create table page_sections (
  id uuid primary key,
  tenant_id uuid not null,
  page_version_id uuid not null,
  layout_id uuid not null references layout_definitions(id),
  sort_order integer not null,
  state text not null check (state in ('EMPTY', 'INCOMPLETE', 'DRAFT', 'READY')),
  responsive_config jsonb not null default '{}'::jsonb,
  unique (tenant_id, id),
  unique (page_version_id, sort_order),
  foreign key (tenant_id, page_version_id) references page_versions(tenant_id, id)
);

create table section_columns (
  id uuid primary key,
  tenant_id uuid not null,
  section_id uuid not null,
  column_index integer not null,
  proportion text not null,
  mobile_order integer not null,
  behavior text not null check (behavior in ('STACK', 'REVERSE', 'ADAPT')),
  unique (tenant_id, id),
  unique (section_id, column_index),
  foreign key (tenant_id, section_id) references page_sections(tenant_id, id)
);

create table page_blocks (
  id uuid primary key,
  tenant_id uuid not null,
  column_id uuid not null,
  block_type text not null,
  schema_version integer not null check (schema_version > 0),
  sort_order integer not null,
  props jsonb not null default '{}'::jsonb,
  linked_content_id uuid null,
  linked_media_id uuid null,
  state text not null check (state in ('DRAFT', 'READY', 'HIDDEN')),
  unique (tenant_id, id),
  foreign key (tenant_id, column_id) references section_columns(tenant_id, id),
  foreign key (tenant_id, linked_content_id) references content_items(tenant_id, id),
  foreign key (tenant_id, linked_media_id) references media_assets(tenant_id, id)
);

create table site_releases (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  version integer not null check (version > 0),
  state text not null check (state in ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'SUPERSEDED')),
  scheduled_for timestamptz null,
  published_at timestamptz null,
  published_by uuid null references users(id),
  based_on_release_id uuid null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, version),
  foreign key (tenant_id, based_on_release_id) references site_releases(tenant_id, id)
);
alter table tenants add constraint tenants_current_release_fk
  foreign key (id, current_release_id) references site_releases(tenant_id, id);

create table site_release_pages (
  tenant_id uuid not null,
  release_id uuid not null,
  page_id uuid not null,
  page_version_id uuid not null,
  primary key (release_id, page_id),
  foreign key (tenant_id, release_id) references site_releases(tenant_id, id),
  foreign key (tenant_id, page_id) references pages(tenant_id, id),
  foreign key (tenant_id, page_version_id) references page_versions(tenant_id, id)
);

create table menus (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  code text not null,
  name text not null,
  location text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table menu_versions (
  id uuid primary key,
  tenant_id uuid not null,
  menu_id uuid not null,
  version integer not null,
  state text not null check (state in ('DRAFT', 'READY', 'PUBLISHED', 'SUPERSEDED')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (menu_id, version),
  foreign key (tenant_id, menu_id) references menus(tenant_id, id)
);

create table menu_items (
  id uuid primary key,
  tenant_id uuid not null,
  menu_version_id uuid not null,
  parent_item_id uuid null,
  depth smallint not null check (depth between 0 and 2),
  label text not null,
  sort_order integer not null,
  target_type text not null check (target_type in ('PAGE', 'CONTENT', 'ANCHOR', 'EXTERNAL_URL')),
  page_id uuid null,
  content_id uuid null,
  external_url text null,
  anchor text null,
  visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC', 'RESTRICTED', 'HIDDEN')),
  unique (tenant_id, id),
  foreign key (tenant_id, menu_version_id) references menu_versions(tenant_id, id),
  foreign key (tenant_id, parent_item_id) references menu_items(tenant_id, id),
  foreign key (tenant_id, page_id) references pages(tenant_id, id),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id),
  check (num_nonnulls(page_id, content_id, external_url, anchor) = 1)
);

create table site_release_menus (
  tenant_id uuid not null,
  release_id uuid not null,
  menu_id uuid not null,
  menu_version_id uuid not null,
  primary key (release_id, menu_id),
  foreign key (tenant_id, release_id) references site_releases(tenant_id, id),
  foreign key (tenant_id, menu_id) references menus(tenant_id, id),
  foreign key (tenant_id, menu_version_id) references menu_versions(tenant_id, id)
);

create table routes (
  id uuid primary key,
  tenant_id uuid not null,
  release_id uuid not null,
  path text not null,
  page_version_id uuid null,
  content_id uuid null,
  route_state text not null check (route_state in ('DRAFT', 'PUBLISHED')),
  unique (tenant_id, id),
  unique (tenant_id, release_id, path),
  foreign key (tenant_id, release_id) references site_releases(tenant_id, id),
  foreign key (tenant_id, page_version_id) references page_versions(tenant_id, id),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id),
  check (num_nonnulls(page_version_id, content_id) = 1)
);

create table moderation_cases (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  case_type text not null,
  reporter_name text not null,
  reporter_contact text not null,
  reason text not null,
  priority text not null default 'HIGH' check (priority in ('NORMAL', 'HIGH', 'URGENT')),
  status text not null default 'HIDDEN_PENDING_REVIEW' check (status in ('OPEN', 'HIDDEN_PENDING_REVIEW', 'UNDER_REVIEW', 'RESOLVED', 'APPEALED', 'CLOSED')),
  due_at timestamptz not null default (now() + interval '24 hours'),
  assigned_to uuid null references users(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz null,
  unique (tenant_id, id)
);

create table moderation_appeals (
  id uuid primary key,
  tenant_id uuid not null,
  case_id uuid not null,
  reason text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by uuid null references users(id),
  decision text null,
  unique (tenant_id, id),
  unique (case_id),
  foreign key (tenant_id, case_id) references moderation_cases(tenant_id, id)
);

create table data_subject_requests (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid null references users(id),
  request_type text not null check (request_type in ('ACCESS', 'CORRECTION', 'ERASURE')),
  status text not null default 'OPEN' check (status in ('OPEN', 'IDENTITY_VALIDATION', 'APPROVED', 'REJECTED', 'COMPLETED')),
  contribution_policy text null check (contribution_policy in ('PRESERVE_ANONYMIZED', 'REMOVE')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (tenant_id, id)
);

create table data_erasure_reports (
  id uuid primary key,
  tenant_id uuid not null,
  request_id uuid not null,
  operation_hash char(64) not null unique,
  authority_user_id uuid not null references users(id),
  summary jsonb not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, request_id) references data_subject_requests(tenant_id, id)
);

create table notifications (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  recipient_user_id uuid not null references users(id),
  notification_type text not null,
  payload jsonb not null,
  status text not null default 'UNREAD' check (status in ('UNREAD', 'READ', 'ARCHIVED')),
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table notification_deliveries (
  id uuid primary key,
  tenant_id uuid not null,
  notification_id uuid not null,
  channel text not null check (channel in ('IN_APP', 'EMAIL')),
  status text not null check (status in ('PENDING', 'SENT', 'DELIVERED', 'FAILED')),
  attempts integer not null default 0,
  last_error text null,
  delivered_at timestamptz null,
  unique (tenant_id, id),
  unique (notification_id, channel),
  foreign key (tenant_id, notification_id) references notifications(tenant_id, id)
);

create table audit_events (
  id uuid primary key,
  tenant_id uuid null references tenants(id),
  actor_user_id uuid null references users(id),
  actor_type text not null,
  action text not null,
  resource_type text not null,
  resource_id uuid null,
  request_id text not null,
  ip inet null,
  before_data jsonb null,
  after_data jsonb null,
  reason text null,
  occurred_at timestamptz not null default now()
);
create index audit_tenant_timeline_idx on audit_events (tenant_id, occurred_at desc, id);

create table outbox_events (
  id uuid primary key,
  tenant_id uuid null references tenants(id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  processed_at timestamptz null,
  attempts integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now()
);
create index outbox_pending_idx on outbox_events (available_at, id) where processed_at is null;

create table storage_usage_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  media_id uuid null,
  delta_bytes bigint not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id)
);

create table quota_alerts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  quota_code text not null,
  usage_value numeric not null,
  limit_value numeric not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  unique (tenant_id, id)
);

-- Index every high-cardinality foreign key used by tenant-scoped access paths.
create index memberships_user_idx on tenant_memberships (user_id, tenant_id);
create index sessions_user_active_idx on auth_sessions (user_id, expires_at) where revoked_at is null;
create index charges_status_due_idx on billing_charges (tenant_id, status, due_date, id);
create index matches_schedule_idx on matches (tenant_id, starts_at, content_id);
create index events_schedule_idx on agenda_events (tenant_id, starts_at, content_id);
create index votes_poll_idx on poll_votes (tenant_id, poll_id, voted_at, id);
create index comments_content_idx on comments (tenant_id, content_id, created_at, id) where deleted_at is null;
create index media_status_idx on media_assets (tenant_id, processing_status, created_at, id) where deleted_at is null;
create index pages_tenant_active_idx on pages (tenant_id, created_at, id) where deleted_at is null;
create index moderation_due_idx on moderation_cases (tenant_id, status, due_at, id) where status not in ('RESOLVED', 'CLOSED');
create index notifications_unread_idx on notifications (tenant_id, recipient_user_id, created_at desc, id) where status = 'UNREAD';

-- Tenant isolation is enforced in the database in addition to application authorization.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'tenant_memberships','membership_roles','membership_permission_overrides','tenant_admin_appointments',
    'guardian_confirmations','support_access_sessions','tenant_domains','tenant_domain_challenges','tenant_suspensions',
    'tenant_contracts','billing_charges','payments','payment_allocations','tenant_entitlement_overrides','tenant_usage_counters',
    'content_items','matches','agenda_events','polls','poll_options','poll_votes','comments','media_assets','media_variants',
    'media_processing_jobs','image_consents','media_consent_links','pages','page_versions','page_sections','section_columns',
    'page_blocks','site_releases','site_release_pages','menus','menu_versions','menu_items','site_release_menus','routes',
    'moderation_cases','moderation_appeals','data_subject_requests','data_erasure_reports','notifications',
    'notification_deliveries','storage_usage_events','quota_alerts'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy %I on %I for all using (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser())) with check (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser()))',
      table_name || '_tenant_policy', table_name
    );
  end loop;
end $$;
