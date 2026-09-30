-- A release is the public authority. Content is snapshotted so later edits never
-- leak onto the public site before the next atomic publication.
create table site_release_content (
  tenant_id uuid not null,
  release_id uuid not null,
  content_id uuid not null,
  content_version integer not null check (content_version > 0),
  content_type text not null check (content_type in ('NEWS', 'HIGHLIGHT', 'EVENT', 'MATCH', 'GALLERY', 'POLL', 'NOTICE')),
  slug text not null,
  snapshot jsonb not null,
  primary key (release_id, content_id),
  unique (tenant_id, release_id, slug),
  foreign key (tenant_id, release_id) references site_releases(tenant_id, id),
  foreign key (tenant_id, content_id) references content_items(tenant_id, id)
);

create index site_release_content_listing_idx
  on site_release_content (tenant_id, release_id, content_type, content_id);

alter table site_release_content enable row level security;
alter table site_release_content force row level security;
create policy site_release_content_tenant_policy on site_release_content
  for all
  using (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser()))
  with check (tenant_id = (select app.current_tenant_id()) or (select app.is_superuser()));
