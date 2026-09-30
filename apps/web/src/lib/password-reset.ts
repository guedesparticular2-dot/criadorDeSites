import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createDatabaseClient } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";
import { hashPassword } from "./auth";
import { consumeAuthRateLimit } from "./auth-rate-limit";

const resetTokenLifetimeMinutes = 30;

function publicBaseUrl() {
  const configured = process.env.APP_URL ?? "http://localhost:3000";
  const base = new URL(configured);
  if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.protocol === "http:")) {
    throw new Error("APP_URL deve usar HTTPS fora do ambiente local.");
  }
  return base.origin;
}

export async function requestPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  if (!await consumeAuthRateLimit("PASSWORD_RESET", email, 3, 60 * 60)) return;

  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      const users = await tx<{ id: string; displayName: string; globalStatus: string }[]>`
        select id, display_name as "displayName", global_status as "globalStatus"
        from users where email_normalized = ${email} limit 1
      `;
      const user = users[0];
      if (!user || user.globalStatus !== "ACTIVE") return;

      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await tx`update password_reset_tokens set consumed_at = now() where user_id = ${user.id} and consumed_at is null`;
      await tx`
        insert into password_reset_tokens (id, user_id, token_hash, expires_at)
        values (${randomUUID()}, ${user.id}, ${tokenHash}, now() + (${resetTokenLifetimeMinutes}::text || ' minutes')::interval)
      `;
      await setRlsContext(tx, { scope: "PASSWORD_RESET", tokenHash });
      const url = new URL("/redefinir-senha", publicBaseUrl());
      url.searchParams.set("token", token);
      await tx`
        insert into outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
        values (
          ${randomUUID()}, 'PASSWORD_RESET_REQUESTED', 'USER', ${user.id},
          ${tx.json({ email, displayName: user.displayName, url: url.toString(), tokenHash })}
        )
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function resetPassword(token: string, password: string) {
  if (password.length < 12 || password.length > 256) throw new Error("A senha deve ter entre 12 e 256 caracteres.");
  if (token.length < 32 || token.length > 128) throw new Error("O link expirou ou não é válido. Solicite outra redefinição.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      const tokens = await tx<{ id: string; userId: string }[]>`
        select id, user_id as "userId" from password_reset_tokens
        where token_hash = ${tokenHash} and consumed_at is null and expires_at > now()
        for update
      `;
      const reset = tokens[0];
      if (!reset) throw new Error("O link expirou ou não é válido. Solicite outra redefinição.");
      await setRlsContext(tx, { scope: "PASSWORD_RESET", tokenHash });
      const consumed = await tx<{ id: string }[]>`
        update password_reset_tokens set consumed_at = now()
        where id = ${reset.id} and consumed_at is null and expires_at > now()
        returning id
      `;
      if (!consumed[0]) throw new Error("O link expirou ou já foi utilizado. Solicite outra redefinição.");
      await tx`
        update user_credentials
        set password_hash = ${await hashPassword(password)}, password_changed_at = now(), failed_attempts = 0, locked_until = null
        where user_id = ${reset.userId}
      `;
      await tx`update auth_sessions set revoked_at = now() where user_id = ${reset.userId} and revoked_at is null`;
      await tx`update auth_mfa_challenges set consumed_at = now() where user_id = ${reset.userId} and consumed_at is null`;
      await tx`insert into audit_events (id, actor_user_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${reset.userId}, 'USER', 'PASSWORD_RESET_COMPLETED', 'USER_CREDENTIAL', ${reset.userId}, ${randomUUID()})`;
    });
  } finally {
    await sql.end();
  }
}
