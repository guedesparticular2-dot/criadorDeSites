-- Run after migration 0015 using the database owner. Existing key ids are
-- deliberately left unchanged to avoid silently rotating live signers.
\set ON_ERROR_STOP on
\getenv web_key_id RLS_CONTEXT_KEY_ID
\getenv web_secret RLS_CONTEXT_HMAC_KEY
\getenv worker_key_id RLS_SYSTEM_CONTEXT_KEY_ID
\getenv worker_secret RLS_SYSTEM_CONTEXT_HMAC_KEY

INSERT INTO app.rls_context_keys (key_id, secret, allowed_scopes)
VALUES (:'web_key_id', :'web_secret', ARRAY['PUBLIC','TENANT','PLATFORM','REGISTRATION','TOKEN','PASSWORD_RESET'])
ON CONFLICT (key_id) DO NOTHING;

INSERT INTO app.rls_context_keys (key_id, secret, allowed_scopes)
VALUES (:'worker_key_id', :'worker_secret', ARRAY['SYSTEM'])
ON CONFLICT (key_id) DO NOTHING;
