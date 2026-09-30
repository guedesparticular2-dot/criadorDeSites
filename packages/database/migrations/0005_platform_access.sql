-- A associação a SUPERUSER é global; papéis de administrador comum continuam
-- exclusivamente vinculados a uma associação de tenant.
create table platform_user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index platform_user_roles_user_idx on platform_user_roles (user_id, role_id);
