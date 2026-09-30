-- Extend shared anti-abuse controls to public registration and privileged invitations.
alter table auth_rate_limits drop constraint auth_rate_limits_action_check;
alter table auth_rate_limits add constraint auth_rate_limits_action_check
  check (action in ('LOGIN', 'PASSWORD_RESET', 'MFA', 'REGISTRATION', 'ADMIN_INVITE'));
create index auth_rate_limits_updated_idx on auth_rate_limits (updated_at);
