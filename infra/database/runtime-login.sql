-- Run with psql as the database owner after all schema migrations.
-- BAIXADA_RUNTIME_PASSWORD is read from the process environment; it is never
-- interpolated into a command line or printed by this script.
\set ON_ERROR_STOP on
\getenv runtime_password BAIXADA_RUNTIME_PASSWORD

SELECT format(
  'CREATE ROLE baixada_runtime_login LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baixada_runtime_login')
\gexec

ALTER ROLE baixada_runtime_login WITH LOGIN PASSWORD :'runtime_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
GRANT baixada_runtime TO baixada_runtime_login;
