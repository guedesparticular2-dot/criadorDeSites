#!/bin/sh
set -eu

pnpm --filter @baixada/database migrate
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/database/runtime-role.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/database/runtime-login.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/database/register-rls-context-keys.sql
