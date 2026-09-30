alter table notifications add column if not exists dedupe_key text null;

create unique index if not exists notifications_tenant_recipient_dedupe_idx
  on notifications (tenant_id, recipient_user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists billing_open_due_lookup_idx
  on billing_charges (due_date, tenant_id, id)
  where status in ('OPEN', 'OVERDUE');

create index if not exists payment_allocations_charge_lookup_idx
  on payment_allocations (tenant_id, charge_id, payment_id);

create index if not exists tenant_domain_challenges_active_lookup_idx
  on tenant_domain_challenges (tenant_id, domain_id, expires_at desc)
  where verified_at is null;
