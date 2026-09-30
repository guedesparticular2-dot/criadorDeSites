import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDatabaseClient } from "@baixada/database/client";
import { clearAuthRateLimit, consumeAuthRateLimit } from "./auth-rate-limit";
import { createRecoveryCodes, createTotpSecret, decryptMfaValue, encryptMfaValue, recoveryCodeHash, verifyTotpCode } from "./mfa";

const scrypt = promisify(scryptCallback);
const sessionCookieName = "baixada_session";
const administrativeSessionSeconds = 60 * 60 * 8;
const memberSessionSeconds = 60 * 60 * 8;
const administrativeIdleSeconds = 60 * 30;
const mfaChallengeCookieName = "baixada_mfa_challenge";
const mfaChallengeSeconds = 60 * 10;

export type MfaChallengePurpose = "ENROLL" | "AUTHENTICATE";

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  isSuperuser: boolean;
  isAdministrative: boolean;
};

type MfaChallenge = {
  id: string;
  userId: string;
  purpose: MfaChallengePurpose;
  secretCiphertext: string | null;
  recoveryCodesCiphertext: string | null;
  completedAt: Date | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltEncoded, hashEncoded] = stored.split("$");
  if (algorithm !== "scrypt" || !saltEncoded || !hashEncoded) return false;
  const actual = await scrypt(password, Buffer.from(saltEncoded, "base64url"), 64) as Buffer;
  const expected = Buffer.from(hashEncoded, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createAdministrativeSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const sql = createDatabaseClient();
  try {
    await sql`
      insert into auth_sessions (id, user_id, token_hash, is_administrative, expires_at)
      values (gen_random_uuid(), ${userId}, ${hashToken(token)}, true, now() + interval '8 hours')
    `;
  } finally {
    await sql.end();
  }
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    maxAge: administrativeSessionSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function createMemberSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const sql = createDatabaseClient();
  try {
    await sql`
      insert into auth_sessions (id, user_id, token_hash, is_administrative, expires_at)
      values (gen_random_uuid(), ${userId}, ${hashToken(token)}, false, now() + interval '8 hours')
    `;
  } finally {
    await sql.end();
  }
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    maxAge: memberSessionSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function createMfaChallenge(userId: string, purpose: MfaChallengePurpose) {
  const token = randomBytes(32).toString("base64url");
  const secretCiphertext = purpose === "ENROLL" ? encryptMfaValue(createTotpSecret()) : null;
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await tx`
        update auth_mfa_challenges
        set consumed_at = now()
        where user_id = ${userId} and consumed_at is null
      `;
      await tx`
        insert into auth_mfa_challenges (id, user_id, token_hash, purpose, secret_ciphertext, expires_at)
        values (gen_random_uuid(), ${userId}, ${hashToken(token)}, ${purpose}, ${secretCiphertext}, now() + interval '10 minutes')
      `;
    });
  } finally {
    await sql.end();
  }
  const cookieStore = await cookies();
  cookieStore.set(mfaChallengeCookieName, token, {
    httpOnly: true,
    maxAge: mfaChallengeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function currentMfaChallenge(allowedPurpose: MfaChallengePurpose, allowCompleted = false): Promise<MfaChallenge | null> {
  const token = (await cookies()).get(mfaChallengeCookieName)?.value;
  if (!token) return null;
  const sql = createDatabaseClient();
  try {
    const rows = await sql<MfaChallenge[]>`
      select id, user_id as "userId", purpose, secret_ciphertext as "secretCiphertext",
        recovery_codes_ciphertext as "recoveryCodesCiphertext", completed_at as "completedAt"
      from auth_mfa_challenges
      where token_hash = ${hashToken(token)}
        and purpose = ${allowedPurpose}
        and expires_at > now()
        and consumed_at is null
        ${allowCompleted ? sql`` : sql`and completed_at is null`}
      limit 1
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end();
  }
}

export async function requireMfaChallenge(purpose: MfaChallengePurpose, allowCompleted = false) {
  const challenge = await currentMfaChallenge(purpose, allowCompleted);
  if (!challenge) redirect("/acesso?erro=mfa-expirado");
  return challenge;
}

async function consumeMfaChallenge(id: string) {
  const sql = createDatabaseClient();
  try {
    await sql`update auth_mfa_challenges set consumed_at = now() where id = ${id} and consumed_at is null`;
  } finally {
    await sql.end();
  }
  (await cookies()).delete(mfaChallengeCookieName);
}

export async function completeMfaEnrollment(code: string) {
  const challenge = await requireMfaChallenge("ENROLL");
  if (!await consumeAuthRateLimit("MFA", `ENROLL:${challenge.userId}`, 5, 10 * 60)) throw new Error("Muitas tentativas. Entre novamente para iniciar outro desafio MFA.");
  if (!challenge.secretCiphertext) throw new Error("O desafio de configuração não possui um segredo válido.");
  const secret = decryptMfaValue(challenge.secretCiphertext);
  if (verifyTotpCode(secret, code) === null) throw new Error("Código do autenticador inválido.");
  const recoveryCodes = createRecoveryCodes();
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      const active = await tx<{ id: string }[]>`
        select id from auth_mfa_challenges
        where id = ${challenge.id} and user_id = ${challenge.userId}
          and purpose = 'ENROLL' and expires_at > now() and consumed_at is null and completed_at is null
        for update
      `;
      if (!active[0]) throw new Error("Esse desafio MFA já não é válido.");
      await tx`
        insert into user_mfa_totp_factors (user_id, secret_ciphertext, confirmed_at)
        values (${challenge.userId}, ${challenge.secretCiphertext}, now())
        on conflict (user_id) do update
          set secret_ciphertext = excluded.secret_ciphertext, confirmed_at = excluded.confirmed_at, updated_at = now(), last_used_step = null
      `;
      await tx`delete from user_mfa_recovery_codes where user_id = ${challenge.userId} and used_at is null`;
      for (const recoveryCode of recoveryCodes) {
        await tx`
          insert into user_mfa_recovery_codes (id, user_id, code_hash)
          values (gen_random_uuid(), ${challenge.userId}, ${recoveryCodeHash(recoveryCode)})
        `;
      }
      await tx`update users set mfa_enabled_at = now() where id = ${challenge.userId}`;
      await tx`
        update auth_mfa_challenges
        set completed_at = now(), recovery_codes_ciphertext = ${encryptMfaValue(JSON.stringify(recoveryCodes))}
        where id = ${challenge.id}
      `;
    });
  } finally {
    await sql.end();
  }
  await clearAuthRateLimit("MFA", `ENROLL:${challenge.userId}`);
  await createAdministrativeSession(challenge.userId);
}

export async function getMfaEnrollmentSecret() {
  const challenge = await requireMfaChallenge("ENROLL");
  if (!challenge.secretCiphertext) redirect("/acesso?erro=mfa-expirado");
  return { secret: decryptMfaValue(challenge.secretCiphertext), userId: challenge.userId };
}

export async function getRecoveryCodeDisclosure() {
  const challenge = await requireMfaChallenge("ENROLL", true);
  if (!challenge.completedAt || !challenge.recoveryCodesCiphertext) redirect("/acesso/mfa/configurar");
  return JSON.parse(decryptMfaValue(challenge.recoveryCodesCiphertext)) as string[];
}

export async function finishMfaEnrollment() {
  const challenge = await requireMfaChallenge("ENROLL", true);
  if (!challenge.completedAt) throw new Error("A configuração MFA ainda não foi confirmada.");
  await consumeMfaChallenge(challenge.id);
}

export async function verifyMfaAuthentication(code: string) {
  const challenge = await requireMfaChallenge("AUTHENTICATE");
  if (!await consumeAuthRateLimit("MFA", challenge.userId, 5, 10 * 60)) throw new Error("Muitas tentativas. Entre novamente para iniciar outro desafio MFA.");
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      const active = await tx<{ id: string }[]>`
        select id from auth_mfa_challenges
        where id = ${challenge.id} and user_id = ${challenge.userId}
          and purpose = 'AUTHENTICATE' and expires_at > now() and consumed_at is null
        for update
      `;
      if (!active[0]) throw new Error("Esse desafio MFA já não é válido.");
      const factor = await tx<{ secretCiphertext: string; lastUsedStep: number | null }[]>`
        select secret_ciphertext as "secretCiphertext", last_used_step as "lastUsedStep"
        from user_mfa_totp_factors where user_id = ${challenge.userId} for update
      `;
      if (!factor[0]) throw new Error("Nenhum autenticador foi configurado para esta conta.");
      const step = verifyTotpCode(decryptMfaValue(factor[0].secretCiphertext), code);
      if (step !== null) {
        if (factor[0].lastUsedStep !== null && factor[0].lastUsedStep >= step) throw new Error("Este código já foi utilizado. Aguarde o próximo código.");
        await tx`update user_mfa_totp_factors set last_used_step = ${step}, updated_at = now() where user_id = ${challenge.userId}`;
      } else {
        const used = await tx<{ id: string }[]>`
          update user_mfa_recovery_codes
          set used_at = now()
          where user_id = ${challenge.userId} and code_hash = ${recoveryCodeHash(code)} and used_at is null
          returning id
        `;
        if (!used[0]) throw new Error("Código de autenticação inválido.");
      }
      await tx`update auth_mfa_challenges set consumed_at = now() where id = ${challenge.id}`;
    });
  } finally {
    await sql.end();
  }
  await clearAuthRateLimit("MFA", challenge.userId);
  (await cookies()).delete(mfaChallengeCookieName);
  await createAdministrativeSession(challenge.userId);
}

export async function clearAdministrativeSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) {
    const sql = createDatabaseClient();
    try {
      await sql`update auth_sessions set revoked_at = now() where token_hash = ${hashToken(token)} and revoked_at is null`;
    } finally {
      await sql.end();
    }
  }
  cookieStore.delete(sessionCookieName);
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;
  const sql = createDatabaseClient();
  try {
    const rows = await sql<AuthenticatedUser[]>`
      select u.id, u.email, u.display_name as "displayName", s.is_administrative as "isAdministrative",
        exists(
          select 1
          from platform_user_roles pur
          join roles r on r.id = pur.role_id
          where pur.user_id = u.id and r.code = 'SUPERUSER'
        ) as "isSuperuser"
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${hashToken(token)}
        and s.revoked_at is null
        and s.expires_at > now()
        and (s.is_administrative = false or s.last_seen_at > now() - interval '30 minutes')
        and u.global_status = 'ACTIVE'
      limit 1
    `;
    const user = rows[0] ?? null;
    if (user) {
      await sql`update auth_sessions set last_seen_at = now() where token_hash = ${hashToken(token)}`;
    }
    return user;
  } finally {
    await sql.end();
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/acesso");
  return user;
}

export async function requireSuperuser() {
  const user = await requireCurrentUser();
  if (!user.isSuperuser || !user.isAdministrative) redirect("/admin?erro=acesso-negado");
  return user;
}

export { administrativeIdleSeconds };
