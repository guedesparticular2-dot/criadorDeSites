-- Store authenticated reporter identity without copying their email/contact data
-- into moderation_cases.reporter_contact.
alter table moderation_cases
  add column if not exists reporter_user_id uuid null references users(id) on delete set null;

alter table notification_deliveries
  add column if not exists available_at timestamptz not null default now();

alter table notification_deliveries
  add column if not exists processing_started_at timestamptz null;

alter table notification_deliveries
  drop constraint if exists notification_deliveries_status_check;

alter table notification_deliveries
  add constraint notification_deliveries_status_check
    check (status in ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED'));

create index if not exists notification_email_delivery_queue_idx
  on notification_deliveries (available_at, id)
  where channel = 'EMAIL' and status in ('PENDING', 'FAILED');

create index if not exists moderation_targets_comment_idx
  on moderation_targets (tenant_id, comment_id, case_id)
  where comment_id is not null;

create index if not exists moderation_cases_reporter_idx
  on moderation_cases (tenant_id, reporter_user_id, opened_at desc)
  where reporter_user_id is not null;
