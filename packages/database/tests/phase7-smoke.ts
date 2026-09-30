import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabaseClient } from "@baixada/database/client";
import {
  createManualCharge,
  getPlatformOperations,
  getTenantOperationalOverview,
  registerManualPayment,
  saveTenantContract,
  setCommercialSuspension,
} from "../../../apps/web/src/lib/platform-operations";
import { createDomainChallenge, activateCanonicalDomain } from "../../../apps/web/src/lib/platform-domains";
import { processPlatformOperationsForTenant } from "../../../apps/worker/src/platform-operations";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_PHASE7_LOCAL !== "1" || !databaseUrl) {
  throw new Error("Set RUN_PHASE7_LOCAL=1 and DATABASE_URL to run the isolated local Fatia 7 smoke test.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(parsedDatabaseUrl.hostname) || parsedDatabaseUrl.pathname !== "/baixada") {
  throw new Error("Safety check: this smoke test only runs against the local database named baixada.");
}

const sql = createDatabaseClient(databaseUrl);
const tenantId = randomUUID();
const otherTenantId = randomUUID();
const actorId = randomUUID();
const contractId = randomUUID();
const otherContractId = randomUUID();
const memberId = randomUUID();
const membershipId = randomUUID();
const mediaRoot = await mkdtemp(join(tmpdir(), "baixada-phase7-"));
const priorMediaRoot = process.env.MEDIA_ROOT;
process.env.MEDIA_ROOT = mediaRoot;
const slug = `phase7-${tenantId}`;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
function dateOffset(date: string, offset: number) {
  const result = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + offset);
  return result.toISOString().slice(0, 10);
}
const dueDate = dateOffset(today, -1);
const delinquentDueDate = dateOffset(today, -10);
const previousPeriod = dateOffset(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
const referencePeriod = today.slice(0, 7);
const canonicalHost = `${slug}.localhost`;

async function seedFixture() {
  await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    const plans = await tx<{ simple: string | null; medium: string | null }[]>`
      select max(id::text) filter (where code = 'SIMPLE') as simple,
        max(id::text) filter (where code = 'MEDIUM') as medium from plans where status = 'ACTIVE'
    `;
    assert.ok(plans[0]?.simple && plans[0]?.medium, "Active SIMPLE and MEDIUM plans must be seeded locally.");
    const primaryRole = await tx<{ id: string }[]>`select id from roles where code = 'PRIMARY_ADMIN' limit 1`;
    assert.ok(primaryRole[0], "The PRIMARY_ADMIN role must be seeded locally.");
    await tx`insert into users (id, email, email_normalized, display_name, birth_date)
      values (${actorId}, ${`${actorId}@phase7.invalid`}, ${`${actorId}@phase7.invalid`}, 'Administrador Principal Fatia 7', '1990-01-01'),
        (${memberId}, ${`${memberId}@phase7.invalid`}, ${`${memberId}@phase7.invalid`}, 'Membro Fatia 7', '1990-01-01')`;
    await tx`insert into tenants (id, slug, legal_name, display_name, operational_status, billing_status)
      values (${tenantId}, ${slug}, 'Fatia 7 Local LTDA', 'Fatia 7 Local', 'ACTIVE', 'ACTIVE')`;
    await tx`insert into tenants (id, slug, legal_name, display_name, operational_status, billing_status)
      values (${otherTenantId}, ${`phase7-control-${otherTenantId}`}, 'Controle Fatia 7 LTDA', 'Controle Fatia 7', 'ACTIVE', 'ACTIVE')`;
    await tx`insert into tenant_contracts (id, tenant_id, plan_id, status, start_date, billing_frequency, contracted_amount, recurring_amount)
      values (${contractId}, ${tenantId}, ${plans[0]!.simple!}, 'ACTIVE', current_date, 'MONTHLY', 100, 100),
        (${otherContractId}, ${otherTenantId}, ${plans[0]!.simple!}, 'ACTIVE', current_date, 'MONTHLY', 100, 100)`;
    await tx`insert into tenant_memberships (id, tenant_id, user_id, status, relationship_text)
      values (${membershipId}, ${tenantId}, ${actorId}, 'APPROVED', 'Administrador de teste')`;
    await tx`insert into membership_roles (tenant_id, membership_id, role_id, granted_by)
      values (${tenantId}, ${membershipId}, ${primaryRole[0]!.id}, ${actorId})`;
    await tx`insert into tenant_domains (id, tenant_id, hostname, kind, is_canonical, verification_status, tls_status, verified_at)
      values (${randomUUID()}, ${tenantId}, ${canonicalHost}, 'PLATFORM_SUBDOMAIN', true, 'VERIFIED', 'ACTIVE', now())`;
    await tx`insert into tenant_entitlement_overrides (id, tenant_id, feature_code, limit_value, reason, created_by)
      values (${randomUUID()}, ${tenantId}, 'storage_bytes', 10, 'Limite sintético do smoke local Fatia 7', ${actorId})`;
    await tx`insert into billing_charges (id, tenant_id, contract_id, reference_period, due_date, expected_amount, charged_amount, status)
      values (${randomUUID()}, ${otherTenantId}, ${otherContractId}, ${`${previousPeriod}-01`}, ${delinquentDueDate}, 60, 60, 'OPEN')`;
    await tx`insert into tenant_usage_counters (tenant_id, active_users, published_pages, storage_bytes)
      values (${otherTenantId}, 0, 0, 77)`;
  });
}

async function cleanupFixture() {
  await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    await tx`delete from notification_deliveries where tenant_id = ${tenantId}`;
    await tx`delete from notifications where tenant_id = ${tenantId}`;
    await tx`delete from quota_alerts where tenant_id = ${tenantId}`;
    await tx`delete from audit_events where tenant_id = ${tenantId}`;
    await tx`delete from tenant_status_history where tenant_id = ${tenantId}`;
    await tx`delete from tenant_suspensions where tenant_id = ${tenantId}`;
    await tx`delete from payment_allocations where tenant_id = ${tenantId}`;
    await tx`delete from payments where tenant_id = ${tenantId}`;
    await tx`delete from billing_charges where tenant_id = ${tenantId}`;
    await tx`delete from contract_versions where tenant_id = ${tenantId}`;
    await tx`delete from tenant_contracts where tenant_id = ${tenantId}`;
    await tx`delete from tenant_entitlement_overrides where tenant_id = ${tenantId}`;
    await tx`delete from membership_roles where tenant_id = ${tenantId}`;
    await tx`delete from tenant_memberships where tenant_id = ${tenantId}`;
    await tx`delete from tenant_usage_counters where tenant_id = ${tenantId}`;
    await tx`delete from billing_charges where tenant_id = ${otherTenantId}`;
    await tx`delete from tenant_usage_counters where tenant_id = ${otherTenantId}`;
    await tx`delete from tenant_contracts where tenant_id = ${otherTenantId}`;
    await tx`delete from tenant_domain_challenges where tenant_id = ${tenantId}`;
    await tx`delete from tenant_domains where tenant_id = ${tenantId}`;
    await tx`delete from tenants where id = ${tenantId}`;
    await tx`delete from tenants where id = ${otherTenantId}`;
    await tx`delete from users where id = any(${[actorId, memberId]}::uuid[])`;
  });
}

async function runSmoke() {
  await seedFixture();
  const created = await createManualCharge(actorId, {
    tenantId,
    referencePeriod,
    dueDate,
    amount: "125.50",
    notes: "Validação local de saldo parcial e suspensão comercial.",
  });
  await registerManualPayment(actorId, {
    chargeId: created.chargeId,
    amount: "40.00",
    paidAt: today,
    method: "PIX",
    externalReference: "phase7-partial",
    evidence: null,
  });

  let financialState = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ chargeStatus: string; allocated: string; billingStatus: string }[]>`
      select charge.status as "chargeStatus", coalesce(sum(allocation.allocated_amount), 0)::text as allocated,
        tenant.billing_status as "billingStatus"
      from billing_charges charge join tenants tenant on tenant.id = charge.tenant_id
      left join payment_allocations allocation on allocation.tenant_id = charge.tenant_id and allocation.charge_id = charge.id
      where charge.tenant_id = ${tenantId} and charge.id = ${created.chargeId}
      group by charge.id, tenant.billing_status
    `;
  });
  assert.deepEqual(financialState[0], { chargeStatus: "OVERDUE", allocated: "40.00", billingStatus: "OVERDUE" }, "A partial overdue payment must preserve the remaining balance and overdue status.");

  await registerManualPayment(actorId, {
    chargeId: created.chargeId,
    amount: "85.50",
    paidAt: today,
    method: "PIX",
    externalReference: "phase7-settlement",
    evidence: null,
  });
  financialState = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ chargeStatus: string; allocated: string; billingStatus: string }[]>`
      select charge.status as "chargeStatus", coalesce(sum(allocation.allocated_amount), 0)::text as allocated,
        tenant.billing_status as "billingStatus"
      from billing_charges charge join tenants tenant on tenant.id = charge.tenant_id
      left join payment_allocations allocation on allocation.tenant_id = charge.tenant_id and allocation.charge_id = charge.id
      where charge.tenant_id = ${tenantId} and charge.id = ${created.chargeId}
      group by charge.id, tenant.billing_status
    `;
  });
  assert.deepEqual(financialState[0], { chargeStatus: "PAID", allocated: "125.50", billingStatus: "ACTIVE" }, "Full settlement must close the charge and restore billing status when no overdue balance remains.");

  await saveTenantContract(actorId, {
    tenantId,
    planCode: "MEDIUM",
    frequency: "QUARTERLY",
    contractedAmount: "750.00",
    recurringAmount: "600.00",
    reason: "Smoke test de alteração contratual.",
  });
  const contract = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ plan: string; frequency: string; version: number }[]>`
      select plan.code as plan, contract.billing_frequency as frequency, version.version
      from tenant_contracts contract join plans plan on plan.id = contract.plan_id
      join contract_versions version on version.tenant_id = contract.tenant_id and version.contract_id = contract.id
      where contract.tenant_id = ${tenantId}
    `;
  });
  assert.deepEqual(contract[0], { plan: "MEDIUM", frequency: "QUARTERLY", version: 1 }, "A contract edit must change the current terms and persist version 1.");

  await setCommercialSuspension(actorId, { tenantId, action: "SUSPEND", reason: "Validação local de suspensão.", confirmation: "SUSPENDER" });
  let tenantState = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ operationalStatus: string; billingStatus: string; kind: string; blockPublic: boolean; blockMembers: boolean; limitedAdmin: boolean; blockPublication: boolean }[]>`
      select tenant.operational_status as "operationalStatus", tenant.billing_status as "billingStatus",
        suspension.kind, suspension.block_public_access as "blockPublic", suspension.block_member_login as "blockMembers",
        suspension.allow_limited_admin_access as "limitedAdmin", suspension.block_publication as "blockPublication"
      from tenants tenant join tenant_suspensions suspension on suspension.tenant_id = tenant.id and suspension.ended_at is null
      where tenant.id = ${tenantId}
    `;
  });
  assert.deepEqual(tenantState[0], { operationalStatus: "SUSPENDED", billingStatus: "ACTIVE", kind: "COMMERCIAL", blockPublic: true, blockMembers: true, limitedAdmin: true, blockPublication: true }, "Operational suspension must block public/member/publication paths without changing billing status.");

  await setCommercialSuspension(actorId, { tenantId, action: "REACTIVATE", reason: "Regularização do teste local.", confirmation: "REATIVAR" });
  tenantState = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ operationalStatus: string; billingStatus: string; activeSuspensions: number }[]>`
      select tenant.operational_status as "operationalStatus", tenant.billing_status as "billingStatus",
        count(suspension.id)::integer as "activeSuspensions"
      from tenants tenant left join tenant_suspensions suspension on suspension.tenant_id = tenant.id and suspension.ended_at is null
      where tenant.id = ${tenantId} group by tenant.id
    `;
  });
  assert.deepEqual(tenantState[0], { operationalStatus: "ACTIVE", billingStatus: "ACTIVE", activeSuspensions: 0 }, "Reactivation must close the commercial suspension without changing billing status.");

  const overview = await getPlatformOperations();
  assert.ok(overview.tenants.some((tenant) => tenant.id === tenantId && tenant.planCode === "MEDIUM"), "Platform operations must show the current tenant plan.");
  assert.ok(overview.charges.some((charge) => charge.id === created.chargeId && charge.outstandingAmount === "0.00"), "Platform operations must show the charge as fully settled.");

  const challenge = await createDomainChallenge(actorId, { tenantId, hostname: `Phase7-${tenantId}.Example.invalid.`, method: "DNS_TXT" });
  assert.equal(challenge.hostname, `phase7-${tenantId}.example.invalid`, "Domain input should be normalized before persistence.");
  assert.equal(challenge.proofName, `_baixada-verification.${challenge.hostname}`);
  const storedChallenge = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ tokenHash: string; canonical: boolean; status: string }[]>`
      select challenge.token_hash as "tokenHash", domain.is_canonical as canonical, domain.verification_status as status
      from tenant_domain_challenges challenge join tenant_domains domain on domain.id = challenge.domain_id
      where challenge.domain_id = ${challenge.domainId} order by challenge.created_at desc limit 1
    `;
  });
  assert.equal(storedChallenge[0]?.tokenHash, createHash("sha256").update(challenge.token).digest("hex"), "Only the challenge token hash should be persisted.");
  assert.equal(storedChallenge[0]?.status, "PENDING");
  await assert.rejects(() => activateCanonicalDomain(actorId, challenge.domainId, "Teste de ativação sem prova."), /Verifique a posse/);
  await assert.rejects(() => createDomainChallenge(actorId, { tenantId: otherTenantId, hostname: challenge.hostname, method: "DNS_TXT" }), /já pertence a outra instância/);
  const canonicalDomain = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ hostname: string; count: number }[]>`
      select max(hostname) filter (where is_canonical) as hostname, count(*) filter (where is_canonical)::integer as count
      from tenant_domains where tenant_id = ${tenantId}
    `;
  });
  assert.deepEqual(canonicalDomain[0], { hostname: canonicalHost, count: 1 }, "An unverified domain must not replace the current canonical hostname.");
  await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    await tx`update tenant_domains set verification_status = 'VERIFIED', verified_at = now() where id = ${challenge.domainId} and tenant_id = ${tenantId}`;
  });
  let tlsProbeHost = "";
  await activateCanonicalDomain(actorId, challenge.domainId, "Prova de ativação com TLS simulado no teste isolado.", async (hostname) => { tlsProbeHost = hostname; });
  assert.equal(tlsProbeHost, challenge.hostname, "Canonical activation must check HTTPS for the verified hostname.");
  const activeDomain = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ hostname: string; tlsStatus: string; canonicalCount: number }[]>`
      select max(hostname) filter (where is_canonical) as hostname,
        max(tls_status) filter (where is_canonical) as "tlsStatus",
        count(*) filter (where is_canonical)::integer as "canonicalCount"
      from tenant_domains where tenant_id = ${tenantId}
    `;
  });
  assert.deepEqual(activeDomain[0], { hostname: challenge.hostname, tlsStatus: "ACTIVE", canonicalCount: 1 }, "A verified domain must replace the canonical domain atomically and retain exactly one canonical hostname.");

  const storageDir = join(mediaRoot, "tenants", tenantId);
  await mkdir(storageDir, { recursive: true });
  await writeFile(join(storageDir, "quota-smoke.txt"), "123456789");
  await createManualCharge(actorId, {
    tenantId,
    referencePeriod: previousPeriod,
    dueDate: delinquentDueDate,
    amount: "60.00",
    notes: "Cobrança sintética para validar suspensão automática após dez dias.",
  });
  await processPlatformOperationsForTenant(sql, tenantId);
  const automaticState = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ activeUsers: number; storageBytes: string; openStorageAlerts: number; operationalStatus: string; billingStatus: string; automatic: boolean; graceDays: number; noticeCount: number }[]>`
      select usage.active_users::integer as "activeUsers", usage.storage_bytes::text as "storageBytes",
        (select count(*)::integer from quota_alerts alert where alert.tenant_id = ${tenantId} and alert.quota_code = 'storage_bytes' and alert.status <> 'RESOLVED') as "openStorageAlerts",
        tenant.operational_status as "operationalStatus", tenant.billing_status as "billingStatus",
        suspension.automatic, suspension.grace_period_days as "graceDays",
        (select count(*)::integer from notifications notification where notification.tenant_id = ${tenantId}) as "noticeCount"
      from tenant_usage_counters usage join tenants tenant on tenant.id = usage.tenant_id
      join tenant_suspensions suspension on suspension.tenant_id = tenant.id and suspension.ended_at is null
      where usage.tenant_id = ${tenantId} and suspension.kind = 'COMMERCIAL'
    `;
  });
  assert.deepEqual(automaticState[0], { activeUsers: 1, storageBytes: "9", openStorageAlerts: 1, operationalStatus: "SUSPENDED", billingStatus: "SUSPENDED", automatic: true, graceDays: 10, noticeCount: 4 }, "Reconciliation should measure physical bytes, open a soft quota alert, notify tenant admins and suspend on day 10.");
  const isolatedTenant = await sql.begin(async (tx) => {
    await tx`select set_config('app.is_superuser', 'true', true)`;
    return tx<{ operationalStatus: string; billingStatus: string; chargeStatus: string; storageBytes: string }[]>`
      select tenant.operational_status as "operationalStatus", tenant.billing_status as "billingStatus",
        charge.status as "chargeStatus", usage.storage_bytes::text as "storageBytes"
      from tenants tenant join billing_charges charge on charge.tenant_id = tenant.id
      join tenant_usage_counters usage on usage.tenant_id = tenant.id where tenant.id = ${otherTenantId}
    `;
  });
  assert.deepEqual(isolatedTenant[0], { operationalStatus: "ACTIVE", billingStatus: "ACTIVE", chargeStatus: "OPEN", storageBytes: "77" }, "A scoped reconciliation must not modify another tenant's billing, suspension, or usage.");
  const tenantOverview = await getTenantOperationalOverview(tenantId, actorId);
  assert.equal(tenantOverview.notifications.length, 4, "The tenant overview should show only the four notices addressed to this tenant's admin.");
  assert.ok(!("charges" in tenantOverview), "A tenant administrator must not receive platform-wide billing records in the operational overview.");
  console.info("Fatia 7 local smoke: financeiro, contrato, suspensão manual, domínio, cota física/aviso suave, suspensão automática no dia 10 e isolamento entre tenants aprovados.");
}

try {
  await runSmoke();
} finally {
  try {
    await cleanupFixture();
  } finally {
    await sql.end();
    await rm(mediaRoot, { recursive: true, force: true });
    if (priorMediaRoot === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = priorMediaRoot;
  }
}
