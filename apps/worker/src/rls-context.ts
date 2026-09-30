import { createHmac } from "node:crypto";
import type postgres from "postgres";

/** Worker-only signer: its secret is distinct from the web context key. */
export async function setSystemRlsContext(tx: postgres.TransactionSql) {
  const keyId = process.env.RLS_SYSTEM_CONTEXT_KEY_ID;
  const secret = process.env.RLS_SYSTEM_CONTEXT_HMAC_KEY;
  if (!keyId || !secret || secret.length < 32) {
    throw new Error("A chave HMAC de contexto RLS do worker não está configurada ou tem menos de 32 caracteres.");
  }
  const payload = JSON.stringify({
    v: 1,
    kid: keyId,
    tenantId: null,
    userId: null,
    tokenHash: null,
    scope: "SYSTEM",
    exp: Math.floor(Date.now() / 1000) + 120,
  });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  await tx`select set_config('app.rls_context', ${payload}, true), set_config('app.rls_context_signature', ${signature}, true)`;
}
