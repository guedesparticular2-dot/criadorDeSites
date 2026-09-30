alter table registration_requests
  add column user_id uuid null references users(id),
  add column membership_id uuid null;

alter table registration_requests
  add constraint registration_requests_membership_fk
  foreign key (tenant_id, membership_id) references tenant_memberships(tenant_id, id);

create unique index registration_request_membership_idx
  on registration_requests (membership_id)
  where membership_id is not null;
