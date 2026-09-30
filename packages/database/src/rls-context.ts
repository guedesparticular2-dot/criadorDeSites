import { createHmac } from "node:crypto";
import type { DatabaseQuery } from "./client";

export type RlsContextScope = "PUBLIC" | "TENANT" | "PLATFORM" | "SYSTEM" | "REGISTRATION" | "TOKEN" | "PASSWORD_RESET";

export type RlsContext = {
  scope: RlsContextScope;
  tenantId?: string | null;
  userId?: string | null;
  tokenHash?: string | null;
};

type RlsContextEnvironment = Record<string, string | undefined>;

export function signRlsContext(context: RlsContext, env: RlsContextEnvironment = process.env, now = Date.now()) {
  const system = context.scope === "SYSTEM";
  const keyId = system ? env.RLS_SYSTEM_CONTEXT_KEY_ID : env.RLS_CONTEXT_KEY_ID;
  const secret = system ? env.RLS_SYSTEM_CONTEXT_HMAC_KEY : env.RLS_CONTEXT_HMAC_KEY;
  if (!keyId || !secret || secret.length < 32) {
    throw new Error(system
      ? "A chave HMAC de contexto RLS do worker não está configurada ou tem menos de 32 caracteres."
      : "A chave HMAC de contexto RLS da aplicação não está configurada ou tem menos de 32 caracteres.");
  }

  const payload = JSON.stringify({
    v: 1,
    kid: keyId,
    tenantId: context.tenantId ?? null,
    userId: context.userId ?? null,
    tokenHash: context.tokenHash ?? null,
    scope: context.scope,
    exp: Math.floor(now / 1000) + 120,
  });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return { payload, signature };
}

/** Install an authenticated, transaction-local RLS context. Raw tenant/superuser GUCs are ignored by policies. */
export async function setRlsContext(tx: DatabaseQuery, context: RlsContext) {
  const signed = signRlsContext(context);
  await tx`select set_config('app.rls_context', ${signed.payload}, true), set_config('app.rls_context_signature', ${signed.signature}, true)`;
}
