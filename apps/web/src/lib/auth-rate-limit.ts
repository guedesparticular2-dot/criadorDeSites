import { createHash } from "node:crypto";
import { createDatabaseClient } from "@baixada/database/client";

function keyHash(action: string, key: string) {
  return createHash("sha256").update(`${action}:${key}`).digest("hex");
}

/** Fixed-window limiter stored in PostgreSQL so all web instances share it. */
export async function consumeAuthRateLimit(action: "LOGIN" | "PASSWORD_RESET" | "MFA" | "REGISTRATION" | "ADMIN_INVITE", key: string, maximum: number, windowSeconds: number) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      const rows = await tx<{ allowed: boolean }[]>`
        insert into auth_rate_limits (action, key_hash, attempts, window_started_at)
        values (${action}, ${keyHash(action, key)}, 1, now())
        on conflict (action, key_hash) do update set
          attempts = case
            when auth_rate_limits.window_started_at <= now() - (${windowSeconds}::text || ' seconds')::interval then 1
            else auth_rate_limits.attempts + 1
          end,
          window_started_at = case
            when auth_rate_limits.window_started_at <= now() - (${windowSeconds}::text || ' seconds')::interval then now()
            else auth_rate_limits.window_started_at
          end,
          blocked_until = case
            when auth_rate_limits.window_started_at <= now() - (${windowSeconds}::text || ' seconds')::interval then null
            when auth_rate_limits.blocked_until > now() then auth_rate_limits.blocked_until
            when auth_rate_limits.attempts + 1 > ${maximum} then now() + (${windowSeconds}::text || ' seconds')::interval
            else null
          end,
          updated_at = now()
        returning blocked_until is null or blocked_until <= now() as allowed
      `;
      return rows[0]?.allowed ?? false;
    });
  } finally {
    await sql.end();
  }
}

export async function clearAuthRateLimit(action: "LOGIN" | "PASSWORD_RESET" | "MFA" | "REGISTRATION" | "ADMIN_INVITE", key: string) {
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await tx`delete from auth_rate_limits where action = ${action} and key_hash = ${keyHash(action, key)}`;
    });
  } finally {
    await sql.end();
  }
}
