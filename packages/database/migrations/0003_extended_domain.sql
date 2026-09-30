create table registration_requests (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  email_normalized text not null,
  submitted_data jsonb not null,
  terms_version text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by uuid null references users(id),
  reviewed_at timestamptz null,
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index registration_active_email_idx on registration_requests (tenant_id, email_normalized) where status = 'PENDING';

create table password_reset_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table contract_versions (
  id uuid primary key,
  tenant_id uuid not null,
  contract_id uuid not null,
  version integer not null check (version > 0),
  plan_id uuid not null references plans(id),
  billing_frequency text not null,
  contracted_amount numeric(14,2) not null,
  recurring_amount numeric(14,2) not null,
  valid_from timestamptz not null,
  valid_until timestamptz null,
  changed_by uuid not null references users(id),
  change_reason text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (contract_id, version),
  foreign key (tenant_id, contract_id) references tenant_contracts(tenant_id, id)
);

create table tenant_status_history (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  status_dimension text not null check (status_dimension in ('OPERATIONAL', 'BILLING')),
  old_status text not null,
  new_status text not null,
  reason text not null,
  changed_by uuid null references users(id),
  changed_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table notices (
  tenant_id uuid not null,
  content_id uuid primary key,
  occurs_at timestamptz not null,
  event_phase text not null check (event_phase in ('FUTURE', 'CURRENT', 'HAPPENED')),
  countdown_config jsonb not null default '{"showSecondsOnMobile":false}'::jsonb,
  post_event_behavior text not null default 'SHOW_HAPPENED' check (post_event_behavior = 'SHOW_HAPPENED'),
  target_url text null,
  foreign key (tenant_id, content_id) references content_items(tenant_id, id)
);

create table external_videos (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  provider text not null check (provider = 'YOUTUBE'),
  provider_video_id text not null,
  canonical_url text not null,
  title text null,
  thumbnail_url text null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'HIDDEN')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, provider, provider_video_id)
);

create table content_media_links (
  tenant_id uuid not null,
  content_id uuid not null,
  media_id uuid not null,
  purpose text not null,
  sort_order integer not null default 0,
  primary key (content_id, media_id, purpose),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id)
);

create table gallery_items (
  tenant_id uuid not null,
  gallery_id uuid not null,
  media_id uuid not null,
  sort_order integer not null,
  visibility_override text null check (visibility_override in ('PUBLIC', 'RESTRICTED', 'HIDDEN')),
  caption text null,
  primary key (gallery_id, media_id),
  unique (gallery_id, sort_order),
  foreign key (tenant_id, gallery_id) references content_items(tenant_id, id),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id)
);

create table media_publication_authorizations (
  id uuid primary key,
  tenant_id uuid not null,
  media_id uuid not null,
  decision text not null check (decision in ('APPROVED', 'REJECTED', 'REVOKED')),
  decided_by uuid not null references users(id),
  decided_at timestamptz not null default now(),
  justification text not null,
  unique (tenant_id, id),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id)
);

create table moderation_targets (
  id uuid primary key,
  tenant_id uuid not null,
  case_id uuid not null,
  media_id uuid null,
  content_id uuid null,
  comment_id uuid null,
  unique (tenant_id, id),
  foreign key (tenant_id, case_id) references moderation_cases(tenant_id, id),
  foreign key (tenant_id, media_id) references media_assets(tenant_id, id),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id),
  foreign key (tenant_id, comment_id) references comments(tenant_id, id),
  check (num_nonnulls(media_id, content_id, comment_id) = 1)
);

create table moderation_actions (
  id uuid primary key,
  tenant_id uuid not null,
  case_id uuid not null,
  action text not null check (action in ('HIDE', 'KEEP', 'SUSPEND', 'REMOVE_LOGICALLY', 'RESTORE', 'CLOSE')),
  previous_state text null,
  new_state text not null,
  justification text not null,
  performed_by uuid not null references users(id),
  performed_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, case_id) references moderation_cases(tenant_id, id)
);

create table data_erasure_operations (
  id uuid primary key,
  tenant_id uuid not null,
  request_id uuid not null,
  status text not null check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  idempotency_key text not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  last_error text null,
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, request_id) references data_subject_requests(tenant_id, id)
);

create table redirects (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  source_path text not null,
  target_path text null,
  target_url text null,
  http_status smallint not null default 308 check (http_status in (301, 302, 307, 308)),
  active_from timestamptz not null default now(),
  active_until timestamptz null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (num_nonnulls(target_path, target_url) = 1)
);
create unique index redirects_active_source_idx on redirects (tenant_id, source_path) where active_until is null;

create table resource_references (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  reference_kind text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, source_type, source_id, target_type, target_id, reference_kind)
);

create table page_templates (
  id uuid primary key,
  tenant_id uuid null references tenants(id),
  name text not null,
  page_type text not null check (page_type in ('INSTITUTIONAL', 'CONTACT', 'NEWS_LIST', 'CONTENT_DETAIL', 'LANDING')),
  schema_version integer not null check (schema_version > 0),
  template jsonb not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

create table section_templates (
  id uuid primary key,
  tenant_id uuid null references tenants(id),
  name text not null,
  layout_id uuid not null references layout_definitions(id),
  schema_version integer not null check (schema_version > 0),
  template jsonb not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

create table design_system_versions (
  id uuid primary key,
  version integer not null unique check (version > 0),
  status text not null check (status in ('DRAFT', 'PUBLISHED', 'RETIRED')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz null
);

create table design_tokens (
  id uuid primary key,
  design_system_version_id uuid not null references design_system_versions(id),
  token_key text not null,
  token_type text not null,
  value jsonb not null,
  unique (design_system_version_id, token_key)
);

create table themes (
  id uuid primary key,
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('BAIXADA', 'GLOBAL', 'CUSTOM_SERVICE')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

create table theme_versions (
  id uuid primary key,
  theme_id uuid not null references themes(id),
  version integer not null,
  design_system_version_id uuid not null references design_system_versions(id),
  token_overrides jsonb not null default '{}'::jsonb,
  component_config jsonb not null default '{}'::jsonb,
  status text not null check (status in ('DRAFT', 'PUBLISHED', 'RETIRED')),
  published_at timestamptz null,
  unique (theme_id, version)
);

create table font_catalog (
  id uuid primary key,
  code text not null unique,
  family text not null,
  source text not null,
  license_data jsonb not null,
  supported_scripts text[] not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE'))
);

create table icon_packs (
  id uuid primary key,
  code text not null unique,
  name text not null,
  version text not null,
  license_data jsonb not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE'))
);

create table tenant_theme_configs (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  theme_version_id uuid not null references theme_versions(id),
  state text not null check (state in ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
  logo_media_id uuid null,
  token_overrides jsonb not null default '{}'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  unique (tenant_id, id),
  foreign key (tenant_id, logo_media_id) references media_assets(tenant_id, id)
);

create table visual_library_assets (
  id uuid primary key,
  tenant_id uuid null references tenants(id),
  media_id uuid null,
  asset_kind text not null,
  name text not null,
  protected boolean not null default true,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

create index registration_queue_idx on registration_requests (tenant_id, status, created_at, id);
create index contract_history_idx on contract_versions (tenant_id, contract_id, version desc);
create index gallery_order_idx on gallery_items (tenant_id, gallery_id, sort_order);
create index moderation_actions_timeline_idx on moderation_actions (tenant_id, case_id, performed_at, id);
create index redirects_lookup_idx on redirects (tenant_id, source_path, active_from);
create index resource_references_target_idx on resource_references (tenant_id, target_type, target_id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'registration_requests','contract_versions','tenant_status_history','notices','external_videos',
    'content_media_links','gallery_items','media_publication_authorizations','moderation_targets',
    'moderation_actions','data_erasure_operations','redirects','resource_references','tenant_theme_configs'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy %I on %I for all using (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser())) with check (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser()))',
      table_name || '_tenant_policy', table_name
    );
  end loop;
end $$;
