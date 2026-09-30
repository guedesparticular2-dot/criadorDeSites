-- MFA administrativo: o segredo TOTP é cifrado pela aplicação antes de ser persistido.
create table user_mfa_totp_factors (
  user_id uuid primary key references users(id) on delete cascade,
  secret_ciphertext text not null,
  confirmed_at timestamptz not null,
  last_used_step bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_mfa_recovery_codes (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz null
);
create index user_mfa_recovery_codes_active_idx
  on user_mfa_recovery_codes (user_id, created_at)
  where used_at is null;

-- A senha nunca cria a sessão administrativa diretamente. Ela cria um desafio
-- curto, associado a um cookie httpOnly, que só pode ser consumido após o MFA.
create table auth_mfa_challenges (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('ENROLL', 'AUTHENTICATE')),
  secret_ciphertext text null,
  recovery_codes_ciphertext text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz null,
  consumed_at timestamptz null,
  check (expires_at > created_at)
);
create index auth_mfa_challenges_active_idx
  on auth_mfa_challenges (user_id, expires_at)
  where consumed_at is null;
