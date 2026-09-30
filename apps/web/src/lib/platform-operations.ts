import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createDatabaseClient } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";

export type PlatformTenantOperation = {
  id: string;
  slug: string;
  displayName: string;
  operationalStatus: string;
  billingStatus: string;
  planCode: string | null;
  planName: string | null;
  billingFrequency: string | null;
  contractedAmount: string | null;
  recurringAmount: string | null;
  activeUsers: number;
  publishedPages: number;
  storageBytes: string;
  quotaLimits: Record<string, string | null> | null;
  suspensionId: string | null;
  suspensionKind: string | null;
  suspensionReason: string | null;
};

export type PlatformCharge = {
  id: string;
  tenantName: string;
  tenantSlug: string;
  referencePeriod: string;
  dueDate: string;
  chargedAmount: string;
  outstandingAmount: string;
  status: string;
};

export type PaymentEvidence = { paymentId: string; tenantId: string; tenantName: string; tenantSlug: string; amount: string; paidAt: Date; method: string; externalReference: string | null };

export async function getPlatformOperations(actorUserId: string) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const metricRows = await tx<{
        monthlyContracted: string;
        expectedThisMonth: string;
        receivedThisMonth: string;
        overdueOpen: string;
        upcomingOpen: string;
        delinquencyPercent: string;
      }[]>`
        with calendar as (
          select timezone('America/Sao_Paulo', now())::date as today,
            date_trunc('month', timezone('America/Sao_Paulo', now()))::date as month_start
        ), open_balances as (
          select charge.due_date, calendar.today,
            greatest(charge.charged_amount - coalesce(sum(allocation.allocated_amount) filter (where payment.status = 'CONFIRMED'), 0), 0) as balance
          from billing_charges charge
          cross join calendar
          left join payment_allocations allocation on allocation.tenant_id = charge.tenant_id and allocation.charge_id = charge.id
          left join payments payment on payment.tenant_id = allocation.tenant_id and payment.id = allocation.payment_id
          where charge.status in ('OPEN', 'OVERDUE')
          group by charge.id, calendar.today
        ), totals as (
          select coalesce(sum(balance) filter (where due_date < today), 0) as overdue,
            coalesce(sum(balance) filter (where due_date >= today), 0) as upcoming
          from open_balances
        )
        select
          coalesce((select sum(case contract.billing_frequency when 'MONTHLY' then contract.recurring_amount when 'QUARTERLY' then contract.recurring_amount / 3 when 'ANNUAL' then contract.recurring_amount / 12 else 0 end)
            from tenant_contracts contract join tenants tenant on tenant.id = contract.tenant_id
            where contract.status = 'ACTIVE' and tenant.operational_status <> 'CLOSED'), 0)::text as "monthlyContracted",
          coalesce((select sum(charge.expected_amount) from billing_charges charge
            cross join calendar
            where charge.reference_period >= calendar.month_start
              and charge.reference_period < (calendar.month_start + interval '1 month')::date
              and charge.status <> 'CANCELLED'), 0)::text as "expectedThisMonth",
          coalesce((select sum(payment.amount) from payments payment
            cross join calendar
            where payment.status = 'CONFIRMED' and payment.paid_at >= (calendar.month_start::timestamp at time zone 'America/Sao_Paulo')
              and payment.paid_at < ((calendar.month_start + interval '1 month')::timestamp at time zone 'America/Sao_Paulo')), 0)::text as "receivedThisMonth",
          totals.overdue::text as "overdueOpen",
          totals.upcoming::text as "upcomingOpen",
          case when totals.overdue + totals.upcoming = 0 then 0
            else round(100 * totals.overdue / (totals.overdue + totals.upcoming), 2) end::text as "delinquencyPercent"
        from totals cross join calendar
      `;
      const tenants = await tx<PlatformTenantOperation[]>`
        select tenant.id, tenant.slug, tenant.display_name as "displayName",
          tenant.operational_status as "operationalStatus", tenant.billing_status as "billingStatus",
          plan.code as "planCode", plan.name as "planName", contract.billing_frequency as "billingFrequency",
          contract.contracted_amount::text as "contractedAmount",
          contract.recurring_amount::text as "recurringAmount",
          coalesce(usage.active_users, 0)::integer as "activeUsers",
          coalesce(usage.published_pages, 0)::integer as "publishedPages",
          coalesce(usage.storage_bytes, 0)::text as "storageBytes",
          entitlements.limits as "quotaLimits",
          suspension.id as "suspensionId", suspension.kind as "suspensionKind", suspension.reason as "suspensionReason"
        from tenants tenant
        left join lateral (
          select current_contract.* from tenant_contracts current_contract
          where current_contract.tenant_id = tenant.id and current_contract.status = 'ACTIVE'
          order by current_contract.created_at desc limit 1
        ) contract on true
        left join plans plan on plan.id = contract.plan_id
        left join tenant_usage_counters usage on usage.tenant_id = tenant.id
        left join lateral (
          select jsonb_object_agg(entitlement.feature_code,
            case when override.id is not null then override.limit_value else entitlement.limit_value end) as limits
          from plan_entitlements entitlement
          left join tenant_entitlement_overrides override on override.tenant_id = tenant.id
            and override.feature_code = entitlement.feature_code and (override.valid_until is null or override.valid_until > now())
          where entitlement.plan_id = contract.plan_id
        ) entitlements on true
        left join lateral (
          select active_suspension.id, active_suspension.kind, active_suspension.reason
          from tenant_suspensions active_suspension
          where active_suspension.tenant_id = tenant.id and active_suspension.ended_at is null
          order by active_suspension.created_at desc limit 1
        ) suspension on true
        where tenant.operational_status <> 'CLOSED'
        order by tenant.created_at desc
      `;
      const charges = await tx<PlatformCharge[]>`
        select charge.id, tenant.display_name as "tenantName", tenant.slug as "tenantSlug",
          charge.reference_period::text as "referencePeriod", charge.due_date::text as "dueDate",
          charge.charged_amount::text as "chargedAmount",
          greatest(charge.charged_amount - coalesce(sum(allocation.allocated_amount) filter (where payment.status = 'CONFIRMED'), 0), 0)::text as "outstandingAmount",
          case when charge.status = 'OPEN' and charge.due_date < timezone('America/Sao_Paulo', now())::date then 'OVERDUE' else charge.status end as status
        from billing_charges charge
        join tenants tenant on tenant.id = charge.tenant_id
        left join payment_allocations allocation on allocation.tenant_id = charge.tenant_id and allocation.charge_id = charge.id
        left join payments payment on payment.tenant_id = allocation.tenant_id and payment.id = allocation.payment_id
        where charge.status <> 'CANCELLED'
        group by charge.id, tenant.display_name, tenant.slug
        order by charge.due_date desc, charge.created_at desc
        limit 40
      `;
      return { metrics: metricRows[0], tenants, charges };
    });
  } finally {
    await sql.end();
  }
}

function parseMoney(value: string, allowZero = false) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor monetário válido em BRL com até duas casas decimais.");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : 0.01) || amount > 999999999999.99) {
    throw new Error("Informe um valor monetário válido em BRL.");
  }
  return amount.toFixed(2);
}

export async function saveTenantContract(actorUserId: string, input: {
  tenantId: string;
  planCode: string;
  frequency: string;
  contractedAmount: string;
  recurringAmount: string;
  reason: string;
}) {
  const contractedAmount = parseMoney(input.contractedAmount, true);
  const recurringAmount = parseMoney(input.recurringAmount, true);
  const reason = input.reason.trim();
  if (reason.length < 8) throw new Error("Informe o motivo da alteração contratual (mínimo de 8 caracteres).");
  if (!["MONTHLY", "QUARTERLY", "ANNUAL"].includes(input.frequency)) throw new Error("Periodicidade inválida.");
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const plans = await tx<{ id: string }[]>`select id from plans where code = ${input.planCode} and status = 'ACTIVE' limit 1`;
      if (!plans[0]) throw new Error("Plano ativo não encontrado.");
      const contracts = await tx<{ id: string; planId: string; frequency: string; contractedAmount: string; recurringAmount: string }[]>`
        select id, plan_id as "planId", billing_frequency as frequency, contracted_amount::text as "contractedAmount", recurring_amount::text as "recurringAmount"
        from tenant_contracts where tenant_id = ${input.tenantId} and status = 'ACTIVE' order by created_at desc limit 1 for update
      `;
      const contract = contracts[0];
      if (!contract) throw new Error("Contrato ativo não encontrado para esta instância.");
      const versions = await tx<{ version: number }[]>`select coalesce(max(version), 0)::integer + 1 as version from contract_versions where contract_id = ${contract.id}`;
      const version = versions[0]?.version ?? 1;
      const now = new Date();
      await tx`update contract_versions set valid_until = ${now} where contract_id = ${contract.id} and valid_until is null`;
      await tx`
        insert into contract_versions (id, tenant_id, contract_id, version, plan_id, billing_frequency, contracted_amount, recurring_amount, valid_from, changed_by, change_reason)
        values (${randomUUID()}, ${input.tenantId}, ${contract.id}, ${version}, ${plans[0].id}, ${input.frequency}, ${contractedAmount}, ${recurringAmount}, ${now}, ${actorUserId}, ${reason})
      `;
      await tx`
        update tenant_contracts set plan_id = ${plans[0].id}, billing_frequency = ${input.frequency},
          contracted_amount = ${contractedAmount}, recurring_amount = ${recurringAmount}, updated_at = now()
        where tenant_id = ${input.tenantId} and id = ${contract.id}
      `;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason, before_data, after_data)
        values (${randomUUID()}, ${input.tenantId}, ${actorUserId}, 'USER', 'TENANT_CONTRACT_UPDATED', 'TENANT_CONTRACT', ${contract.id}, ${randomUUID()}, ${reason},
          ${JSON.stringify({ planId: contract.planId, frequency: contract.frequency, contractedAmount: contract.contractedAmount, recurringAmount: contract.recurringAmount })}::jsonb,
          ${JSON.stringify({ planId: plans[0].id, frequency: input.frequency, contractedAmount, recurringAmount, version })}::jsonb)
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function createManualCharge(actorUserId: string, input: { tenantId: string; referencePeriod: string; dueDate: string; amount: string; notes: string }) {
  const amount = parseMoney(input.amount);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.referencePeriod) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("Período de referência ou vencimento inválido.");
  const referencePeriod = `${input.referencePeriod}-01`;
  const dueDate = new Date(`${input.dueDate}T00:00:00.000Z`);
  if (Number.isNaN(dueDate.valueOf()) || dueDate.toISOString().slice(0, 10) !== input.dueDate) throw new Error("Data de vencimento inválida.");
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const contracts = await tx<{ id: string; tenantSlug: string }[]>`
        select contract.id, tenant.slug as "tenantSlug" from tenant_contracts contract join tenants tenant on tenant.id = contract.tenant_id
        where contract.tenant_id = ${input.tenantId} and contract.status = 'ACTIVE' order by contract.created_at desc limit 1
      `;
      const contract = contracts[0];
      if (!contract) throw new Error("Instância sem contrato ativo.");
      const chargeId = randomUUID();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const status = input.dueDate < today ? "OVERDUE" : "OPEN";
      await tx`
        insert into billing_charges (id, tenant_id, contract_id, reference_period, due_date, expected_amount, charged_amount, status, notes)
        values (${chargeId}, ${input.tenantId}, ${contract.id}, ${referencePeriod}, ${input.dueDate}, ${amount}, ${amount}, ${status}, ${input.notes.trim() || null})
      `;
      if (status === "OVERDUE") await tx`update tenants set billing_status = 'OVERDUE', updated_at = now() where id = ${input.tenantId}`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${input.tenantId}, ${actorUserId}, 'USER', 'BILLING_CHARGE_CREATED', 'BILLING_CHARGE', ${chargeId}, ${randomUUID()},
          ${JSON.stringify({ referencePeriod, dueDate: input.dueDate, amount, currency: 'BRL', tenantSlug: contract.tenantSlug })}::jsonb)
      `;
      return { chargeId, tenantSlug: contract.tenantSlug };
    });
  } finally {
    await sql.end();
  }
}

export async function registerManualPayment(actorUserId: string, input: { chargeId: string; amount: string; paidAt: string; method: string; externalReference: string; evidence: File | null }) {
  const amount = parseMoney(input.amount);
  if (!["PIX", "BOLETO", "TRANSFER", "CARD"].includes(input.method)) throw new Error("Meio de pagamento inválido.");
  const paidAt = new Date(`${input.paidAt}T12:00:00.000Z`);
  if (Number.isNaN(paidAt.valueOf()) || paidAt.toISOString().slice(0, 10) !== input.paidAt) throw new Error("Data de recebimento inválida.");
  const extensions: Record<string, { extension: string; signature: (bytes: Buffer) => boolean }> = {
    "application/pdf": { extension: ".pdf", signature: (bytes) => bytes.subarray(0, 5).toString("ascii") === "%PDF-" },
    "image/jpeg": { extension: ".jpg", signature: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
    "image/png": { extension: ".png", signature: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  };
  if (input.evidence && input.evidence.size > 10 * 1024 * 1024) throw new Error("O comprovante pode ter no máximo 10 MB.");
  const evidenceRule = input.evidence ? extensions[input.evidence.type] : undefined;
  if (input.evidence && !evidenceRule) throw new Error("O comprovante deve ser PDF, JPEG ou PNG.");
  const evidenceBytes = input.evidence ? Buffer.from(await input.evidence.arrayBuffer()) : null;
  if (input.evidence && (!evidenceBytes || !evidenceRule?.signature(evidenceBytes))) throw new Error("O conteúdo do comprovante não corresponde ao formato informado.");
  const paymentId = randomUUID();
  let evidencePath: string | null = null;
  let evidenceAbsolutePath: string | null = null;
  if (evidenceBytes && evidenceRule) {
    const chargeSql = createDatabaseClient();
    let evidenceTenantId = "";
    try {
      const chargeRows = await chargeSql.begin(async (tx) => {
        await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
        return tx<{ tenantId: string }[]>`select tenant_id as "tenantId" from billing_charges where id = ${input.chargeId} limit 1`;
      });
      evidenceTenantId = chargeRows[0]?.tenantId ?? "";
    } finally { await chargeSql.end(); }
    if (!evidenceTenantId) throw new Error("Cobrança não encontrada para associar o comprovante.");
    evidencePath = join("billing-evidence", evidenceTenantId, `${paymentId}${evidenceRule.extension}`);
    const root = resolve(process.env.MEDIA_ROOT ?? "./uploads");
    evidenceAbsolutePath = join(root, evidencePath);
    const directory = join(root, "billing-evidence", evidenceTenantId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${evidenceAbsolutePath}.uploading`;
    await writeFile(temporaryPath, evidenceBytes, { flag: "wx", mode: 0o600 });
    try { await rename(temporaryPath, evidenceAbsolutePath); }
    catch (error) { await rm(temporaryPath, { force: true }); throw error; }
  }
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const charges = await tx<{ id: string; tenantId: string; status: string; dueDate: string; chargedAmount: string }[]>`
        select id, tenant_id as "tenantId", status, due_date::text as "dueDate", charged_amount::text as "chargedAmount"
        from billing_charges where id = ${input.chargeId} for update
      `;
      const charge = charges[0];
      if (!charge || charge.status === "CANCELLED") throw new Error("Cobrança aberta não encontrada.");
      const allocated = await tx<{ amount: string }[]>`
        select coalesce(sum(allocation.allocated_amount), 0)::text as amount
        from payment_allocations allocation join payments payment on payment.tenant_id = allocation.tenant_id and payment.id = allocation.payment_id
        where allocation.tenant_id = ${charge.tenantId} and allocation.charge_id = ${charge.id} and payment.status = 'CONFIRMED'
      `;
      const outstanding = Number(charge.chargedAmount) - Number(allocated[0]?.amount ?? 0);
      if (Number(amount) > outstanding + 0.00001) throw new Error("O valor recebido excede o saldo aberto desta cobrança.");
      await tx`
        insert into payments (id, tenant_id, paid_at, amount, method, external_reference, evidence_path, status, created_by)
        values (${paymentId}, ${charge.tenantId}, ${paidAt}, ${amount}, ${input.method}, ${input.externalReference.trim() || null}, ${evidencePath}, 'CONFIRMED', ${actorUserId})
      `;
      await tx`insert into payment_allocations (tenant_id, payment_id, charge_id, allocated_amount) values (${charge.tenantId}, ${paymentId}, ${charge.id}, ${amount})`;
      const remaining = outstanding - Number(amount);
      const platformToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const nextStatus = remaining <= 0.00001 ? "PAID" : (charge.dueDate < platformToday ? "OVERDUE" : "OPEN");
      await tx`update billing_charges set status = ${nextStatus} where id = ${charge.id} and tenant_id = ${charge.tenantId}`;
      const overdue = await tx<{ exists: boolean }[]>`
        select exists(
          select 1 from billing_charges open_charge
          left join lateral (
            select coalesce(sum(allocation.allocated_amount), 0) as amount
            from payment_allocations allocation join payments payment
              on payment.tenant_id = allocation.tenant_id and payment.id = allocation.payment_id
            where allocation.tenant_id = open_charge.tenant_id and allocation.charge_id = open_charge.id and payment.status = 'CONFIRMED'
          ) settled on true
          where open_charge.tenant_id = ${charge.tenantId} and open_charge.status not in ('PAID', 'CANCELLED')
            and open_charge.due_date < timezone('America/Sao_Paulo', now())::date
            and open_charge.charged_amount > settled.amount
        ) as exists
      `;
      if (!overdue[0]?.exists) await tx`update tenants set billing_status = 'ACTIVE', updated_at = now() where id = ${charge.tenantId} and billing_status in ('OVERDUE', 'SUSPENDED')`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${charge.tenantId}, ${actorUserId}, 'USER', 'PAYMENT_REGISTERED', 'PAYMENT', ${paymentId}, ${randomUUID()},
          ${JSON.stringify({ chargeId: charge.id, amount, method: input.method, paidAt: paidAt.toISOString(), currency: 'BRL', status: nextStatus, evidenceAttached: Boolean(evidencePath), filename: input.evidence ? basename(input.evidence.name) : null })}::jsonb)
      `;
    });
  } catch (error) {
    if (evidenceAbsolutePath) await rm(evidenceAbsolutePath, { force: true });
    throw error;
  } finally {
    await sql.end();
  }
}

export async function setCommercialSuspension(actorUserId: string, input: { tenantId: string; action: string; reason: string; confirmation: string }) {
  const reason = input.reason.trim();
  if (reason.length < 8) throw new Error("Informe um motivo com pelo menos oito caracteres.");
  if (!["SUSPEND", "REACTIVATE"].includes(input.action)) throw new Error("Ação de operação inválida.");
  const expectedConfirmation = input.action === "SUSPEND" ? "SUSPENDER" : "REATIVAR";
  if (input.confirmation.trim().toUpperCase() !== expectedConfirmation) throw new Error(`Digite ${expectedConfirmation} para confirmar.`);
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const tenants = await tx<{ slug: string; operationalStatus: string; billingStatus: string }[]>`
        select slug, operational_status as "operationalStatus", billing_status as "billingStatus"
        from tenants where id = ${input.tenantId} for update
      `;
      const tenant = tenants[0];
      if (!tenant) throw new Error("Instância não encontrada.");
      if (input.action === "SUSPEND") {
        if (tenant.operationalStatus !== "ACTIVE") throw new Error("Somente instâncias ativas podem receber uma suspensão comercial.");
        const suspensionId = randomUUID();
        await tx`
          insert into tenant_suspensions (id, tenant_id, kind, reason, public_message, block_public_access, block_member_login,
            allow_limited_admin_access, block_publication, grace_period_days, automatic, started_at, created_by)
          values (${suspensionId}, ${input.tenantId}, 'COMMERCIAL', ${reason}, 'Este site está temporariamente indisponível. Entre em contato com a administração para regularização.', true, true, true, true, 0, false, now(), ${actorUserId})
        `;
        await tx`update tenants set operational_status = 'SUSPENDED', updated_at = now() where id = ${input.tenantId}`;
        await tx`
          insert into tenant_status_history (id, tenant_id, status_dimension, old_status, new_status, reason, changed_by)
          values (${randomUUID()}, ${input.tenantId}, 'OPERATIONAL', ${tenant.operationalStatus}, 'SUSPENDED', ${reason}, ${actorUserId})
        `;
        await tx`
          insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason, after_data)
          values (${randomUUID()}, ${input.tenantId}, ${actorUserId}, 'USER', 'TENANT_SUSPENDED', 'TENANT_SUSPENSION', ${suspensionId}, ${randomUUID()}, ${reason},
            ${JSON.stringify({ kind: 'COMMERCIAL', automatic: false, blockPublicAccess: true, blockMemberLogin: true, blockPublication: true })}::jsonb)
        `;
      } else {
        if (tenant.operationalStatus !== "SUSPENDED") throw new Error("A instância não está suspensa.");
        const suspensions = await tx<{ id: string; automatic: boolean }[]>`
          select id, automatic from tenant_suspensions where tenant_id = ${input.tenantId} and kind = 'COMMERCIAL' and ended_at is null order by created_at desc limit 1 for update
        `;
        if (!suspensions[0]) throw new Error("A suspensão não é comercial ou já foi encerrada; reativação exige análise operacional.");
        if (suspensions[0].automatic && tenant.billingStatus !== "ACTIVE") throw new Error("Regularize as cobranças vencidas antes de reativar esta instância.");
        await tx`update tenant_suspensions set ended_at = now() where id = ${suspensions[0].id} and tenant_id = ${input.tenantId}`;
        await tx`update tenants set operational_status = 'ACTIVE', updated_at = now() where id = ${input.tenantId}`;
        await tx`
          insert into tenant_status_history (id, tenant_id, status_dimension, old_status, new_status, reason, changed_by)
          values (${randomUUID()}, ${input.tenantId}, 'OPERATIONAL', ${tenant.operationalStatus}, 'ACTIVE', ${reason}, ${actorUserId})
        `;
        await tx`
          insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason, after_data)
          values (${randomUUID()}, ${input.tenantId}, ${actorUserId}, 'USER', 'TENANT_REACTIVATED', 'TENANT_SUSPENSION', ${suspensions[0].id}, ${randomUUID()}, ${reason},
            ${JSON.stringify({ operationalStatus: 'ACTIVE' })}::jsonb)
        `;
      }
    });
  } finally {
    await sql.end();
  }
}

export async function getTenantOperationalOverview(tenantId: string, userId: string) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      const notifications = await tx<{ id: string; type: string; payload: Record<string, unknown>; createdAt: Date }[]>`
        select id, notification_type as type, payload, created_at as "createdAt"
        from notifications where tenant_id = ${tenantId} and recipient_user_id = ${userId} and status <> 'ARCHIVED'
        order by created_at desc limit 10
      `;
      const usage = await tx<{ activeUsers: string; publishedPages: string; storageBytes: string }[]>`
        select active_users::text as "activeUsers", published_pages::text as "publishedPages", storage_bytes::text as "storageBytes"
        from tenant_usage_counters where tenant_id = ${tenantId} limit 1
      `;
      const limits = await tx<{ featureCode: string; limitValue: string | null }[]>`
        select entitlement.feature_code as "featureCode",
          case when override.id is not null then override.limit_value else entitlement.limit_value end::text as "limitValue"
        from tenant_contracts contract
        join plan_entitlements entitlement on entitlement.plan_id = contract.plan_id
        left join tenant_entitlement_overrides override on override.tenant_id = contract.tenant_id
          and override.feature_code = entitlement.feature_code and (override.valid_until is null or override.valid_until > now())
        where contract.tenant_id = ${tenantId} and contract.status = 'ACTIVE'
      `;
      return { notifications, usage: usage[0] ?? { activeUsers: "0", publishedPages: "0", storageBytes: "0" }, limits };
    });
  } finally { await sql.end(); }
}

export async function listPaymentEvidence(actorUserId: string): Promise<PaymentEvidence[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      return tx<PaymentEvidence[]>`
        select payment.id as "paymentId", payment.tenant_id as "tenantId", tenant.display_name as "tenantName",
          tenant.slug as "tenantSlug", payment.amount::text as amount, payment.paid_at as "paidAt",
          payment.method, payment.external_reference as "externalReference"
        from payments payment join tenants tenant on tenant.id = payment.tenant_id
        where payment.evidence_path is not null and payment.status = 'CONFIRMED'
        order by payment.paid_at desc limit 50
      `;
    });
  } finally { await sql.end(); }
}

export async function getPaymentEvidencePath(actorUserId: string, paymentId: string) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const rows = await tx<{ tenantId: string; evidencePath: string }[]>`
        select tenant_id as "tenantId", evidence_path as "evidencePath" from payments
        where id = ${paymentId} and evidence_path is not null and status = 'CONFIRMED' limit 1
      `;
      const payment = rows[0];
      if (!payment) throw new Error("Comprovante não encontrado.");
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id)
        values (${randomUUID()}, ${payment.tenantId}, ${actorUserId}, 'USER', 'PAYMENT_EVIDENCE_ACCESSED', 'PAYMENT', ${paymentId}, ${randomUUID()})
      `;
      const root = resolve(process.env.MEDIA_ROOT ?? "./uploads");
      const absolutePath = resolve(root, payment.evidencePath);
      if (!absolutePath.startsWith(`${resolve(root)}/billing-evidence/`)) throw new Error("Caminho do comprovante inválido.");
      return { absolutePath };
    });
  } finally { await sql.end(); }
}
