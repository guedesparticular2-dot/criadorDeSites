"use server";

import { redirect } from "next/navigation";
import { createDatabaseClient } from "@baixada/database/client";
import { createAdministrativeSession, createMemberSession, createMfaChallenge, verifyPassword } from "../../lib/auth";
import { clearAuthRateLimit, consumeAuthRateLimit } from "../../lib/auth-rate-limit";
import { platformIsConfigured } from "../../lib/platform";

export async function signInAction(formData: FormData) {
  if (!await platformIsConfigured()) redirect("/setup");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rateLimitKey = email.slice(0, 254);
  if (!await consumeAuthRateLimit("LOGIN", rateLimitKey, 10, 15 * 60)) {
    redirect("/acesso?erro=credenciais-invalidas");
  }
  const sql = createDatabaseClient();
  let destination = "/";
  try {
    const rows = await sql<{ id: string; passwordHash: string; globalStatus: string; mfaEnabledAt: Date | null; lockedUntil: Date | null; hasAdministrativeAccess: boolean; hasSuperuserRole: boolean; hasApprovedMembership: boolean }[]>`
      select u.id, u.global_status as "globalStatus", u.mfa_enabled_at as "mfaEnabledAt", credentials.password_hash as "passwordHash",
        credentials.failed_attempts as "failedAttempts", credentials.locked_until as "lockedUntil",
        exists(
          select 1 from platform_user_roles platform_role join roles platform_role_definition on platform_role_definition.id = platform_role.role_id
          where platform_role.user_id = u.id and platform_role_definition.code = 'SUPERUSER'
        ) or exists(
          select 1 from tenant_memberships membership
          join membership_roles membership_role on membership_role.membership_id = membership.id
          join roles role on role.id = membership_role.role_id
          where membership.user_id = u.id and membership.status = 'APPROVED' and role.code in ('PRIMARY_ADMIN', 'ADMIN')
        ) as "hasAdministrativeAccess",
        exists(
          select 1 from platform_user_roles platform_role join roles platform_role_definition on platform_role_definition.id = platform_role.role_id
          where platform_role.user_id = u.id and platform_role_definition.code = 'SUPERUSER'
        ) as "hasSuperuserRole",
        exists(
          select 1 from tenant_memberships membership
          join tenants tenant on tenant.id = membership.tenant_id
          where membership.user_id = u.id and membership.status = 'APPROVED' and tenant.operational_status = 'ACTIVE'
        ) as "hasApprovedMembership"
      from users u join user_credentials credentials on credentials.user_id = u.id
      where u.email_normalized = ${email}
      limit 1
    `;
    const user = rows[0];
    const passwordValid = user ? await verifyPassword(password, user.passwordHash) : false;
    const locked = Boolean(user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());
    if (!user || user.globalStatus !== "ACTIVE" || (!user.hasAdministrativeAccess && !user.hasApprovedMembership) || locked || !passwordValid) {
      if (user && !locked && !passwordValid) {
        await sql`
          update user_credentials
          set failed_attempts = failed_attempts + 1,
            locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
          where user_id = ${user.id}
        `;
      }
      redirect("/acesso?erro=credenciais-invalidas");
    }
    await sql`update user_credentials set failed_attempts = 0, locked_until = null where user_id = ${user.id}`;
    await clearAuthRateLimit("LOGIN", rateLimitKey);
    if (user.hasAdministrativeAccess) {
      await createMfaChallenge(user.id, user.mfaEnabledAt ? "AUTHENTICATE" : "ENROLL");
      redirect(user.mfaEnabledAt ? "/acesso/mfa" : "/acesso/mfa/configurar");
    }
    await sql`update users set last_login_at = now() where id = ${user.id}`;
    if (user.hasAdministrativeAccess) {
      await createAdministrativeSession(user.id);
      destination = user.hasSuperuserRole ? "/platform" : "/admin";
    } else {
      await createMemberSession(user.id);
    }
  } finally {
    await sql.end();
  }
  redirect(destination);
}
