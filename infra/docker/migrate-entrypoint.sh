#!/bin/sh
set -eu

export LC_ALL=C
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS public.schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'

for migration in /migrations/*.sql; do
  filename=${migration##*/}
  already_applied=$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM public.schema_migrations WHERE filename = '$filename'")
  if [ "$already_applied" = "1" ]; then
    continue
  fi

  bundle=$(mktemp)
  cp "$migration" "$bundle"
  printf "\nINSERT INTO public.schema_migrations (filename) VALUES ('%s');\n" "$filename" >> "$bundle"
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f "$bundle"
  rm -f "$bundle"
  printf 'applied %s\n' "$filename"
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /infra/database/runtime-role.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /infra/database/runtime-login.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /infra/database/register-rls-context-keys.sql
