import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createDatabaseClient } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";
import { hashPassword, verifyPassword } from "./auth";
import type { TenantSummary } from "./tenant";

const termsVersion = "2026-09-24";

function ageOn(dateOfBirth: string) {
  const born = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return Number.NaN;
  const today = new Date();
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const anniversary = new Date(Date.UTC(today.getUTCFullYear(), born.getUTCMonth(), born.getUTCDate()));
  if (anniversary > today) age -= 1;
  return age;
}

export async function submitRegistration(tenant: TenantSummary, input: {
  displayName: string;
  email: string;
  password: string;
  birthDate: string;
  relationshipText: string;
  acceptedTerms: boolean;
  guardianName: string;
  guardianEmail: string;
}) {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const relationshipText = input.relationshipText.trim();
  const minor = ageOn(input.birthDate) < 18;
  if (displayName.length < 3 || !email.includes("@") || input.password.length < 12 || !relationshipText || !input.acceptedTerms || Number.isNaN(ageOn(input.birthDate))) {
    throw new Error("Preencha os dados obrigatórios e aceite os termos.");
  }
  if (minor && (input.guardianName.trim().length < 3 || !input.guardianEmail.includes("@"))) {
    throw new Error("Para menores de idade, informe nome e e-mail do responsável.");
  }
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      const existing = await tx<{ id: string; passwordHash: string; displayName: string; birthDate: string; globalStatus: string }[]>`
        select account.id, credentials.password_hash as "passwordHash", account.display_name as "displayName",
          account.birth_date::text as "birthDate", account.global_status as "globalStatus"
        from users account join user_credentials credentials on credentials.user_id = account.id
        where account.email_normalized = ${email} limit 1
      `;
      const account = existing[0];
      if (account && (account.globalStatus !== "ACTIVE" || !await verifyPassword(input.password, account.passwordHash))) {
        throw new Error("Não foi possível enviar o cadastro. Confira os dados ou entre na sua conta antes de solicitar vínculo.");
      }
      const userId = account?.id ?? randomUUID();
      const effectiveDisplayName = account?.displayName ?? displayName;
      const effectiveBirthDate = account?.birthDate ?? input.birthDate;
      if (!account) {
        await tx`
          insert into users (id, email, email_normalized, display_name, birth_date)
          values (${userId}, ${email}, ${email}, ${effectiveDisplayName}, ${effectiveBirthDate})
        `;
        await tx`insert into user_credentials (user_id, password_hash) values (${userId}, ${await hashPassword(input.password)})`;
      }
      await setRlsContext(tx, { scope: "REGISTRATION", tenantId: tenant.id, userId });
      const effectiveMinor = ageOn(effectiveBirthDate) < 18;
      if (effectiveMinor && (input.guardianName.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guardianEmail.trim()))) {
        throw new Error("Para menores de idade, informe nome e e-mail do responsável.");
      }
      const duplicateMembership = await tx<{ id: string }[]>`
        select id from tenant_memberships where tenant_id = ${tenant.id} and user_id = ${userId} limit 1
      `;
      if (duplicateMembership[0]) throw new Error("Não foi possível enviar o cadastro. Confira os dados ou entre na sua conta antes de solicitar vínculo.");
      const membershipId = randomUUID();
      const requestId = randomUUID();
      await tx`
        insert into tenant_memberships (id, tenant_id, user_id, status, relationship_text)
        values (${membershipId}, ${tenant.id}, ${userId}, 'PENDING', ${relationshipText})
      `;
      await tx`
        insert into registration_requests (id, tenant_id, user_id, membership_id, email_normalized, submitted_data, terms_version)
        values (${requestId}, ${tenant.id}, ${userId}, ${membershipId}, ${email}, ${tx.json({ displayName: effectiveDisplayName, birthDate: effectiveBirthDate, relationshipText, minor: effectiveMinor })}, ${termsVersion})
      `;
      if (effectiveMinor) {
        const token = randomBytes(32).toString("base64url");
        const guardianTokenHash = createHash("sha256").update(token).digest("hex");
        const confirmationId = randomUUID();
        await tx`
          insert into guardian_confirmations (id, tenant_id, membership_id, guardian_name, guardian_email, token_hash, terms_version, expires_at)
          values (${confirmationId}, ${tenant.id}, ${membershipId}, ${input.guardianName.trim()}, ${input.guardianEmail.trim().toLowerCase()}, ${guardianTokenHash}, ${termsVersion}, now() + interval '7 days')
        `;
        const domains = await tx<{ hostname: string }[]>`
          select hostname from tenant_domains where tenant_id = ${tenant.id} and is_canonical = true and verification_status = 'VERIFIED' limit 1
        `;
        const hostname = domains[0]?.hostname;
        if (!hostname) throw new Error("Este clube ainda não possui um domínio válido para enviar a confirmação do responsável.");
        const configuredBase = new URL(process.env.APP_URL ?? "http://localhost:3000");
        const base = hostname.endsWith(".localhost")
          ? `${configuredBase.protocol}//${hostname}${configuredBase.port ? `:${configuredBase.port}` : ""}`
          : `https://${hostname}`;
        const confirmationUrl = new URL("/cadastro/responsavel", base);
        confirmationUrl.searchParams.set("token", token);
        await tx`
          insert into outbox_events (id, tenant_id, event_type, aggregate_type, aggregate_id, payload)
          values (${randomUUID()}, ${tenant.id}, 'GUARDIAN_CONFIRMATION_REQUESTED', 'GUARDIAN_CONFIRMATION', ${confirmationId}, ${tx.json({ email: input.guardianEmail.trim().toLowerCase(), guardianName: input.guardianName.trim(), displayName: effectiveDisplayName, url: confirmationUrl.toString(), tokenHash: guardianTokenHash })})
        `;
      }
      await tx`
        insert into audit_events (id, tenant_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${tenant.id}, 'SYSTEM', 'REGISTRATION_SUBMITTED', 'REGISTRATION_REQUEST', ${requestId}, ${randomUUID()}, ${JSON.stringify({ minor: effectiveMinor, reusedGlobalIdentity: Boolean(account) })}::jsonb)
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function confirmGuardian(token: string) {
  if (!token) throw new Error("Link de confirmação inválido.");
  const sql = createDatabaseClient();
  try {
    const result = await sql.begin(async (tx) => {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await setRlsContext(tx, { scope: "TOKEN", tokenHash });
      const rows = await tx<{ id: string; tenantId: string; membershipId: string; status: string }[]>`
        select id, tenant_id as "tenantId", membership_id as "membershipId", status
        from guardian_confirmations
        where token_hash = ${tokenHash} and expires_at > now()
        for update
      `;
      const confirmation = rows[0];
      if (!confirmation) throw new Error("Este link expirou ou não é válido.");
      if (confirmation.status === "CONFIRMED") return "already-confirmed";
      await tx`update guardian_confirmations set status = 'CONFIRMED', confirmed_at = now() where id = ${confirmation.id}`;
      await tx`
        insert into audit_events (id, tenant_id, actor_type, action, resource_type, resource_id, request_id)
        values (${randomUUID()}, ${confirmation.tenantId}, 'SYSTEM', 'GUARDIAN_CONFIRMED', 'GUARDIAN_CONFIRMATION', ${confirmation.id}, ${randomUUID()})
      `;
      return "confirmed";
    });
    return result;
  } finally {
    await sql.end();
  }
}
