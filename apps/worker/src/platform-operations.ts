import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { setSystemRlsContext } from "./rls-context.js";

type TenantOperation = { id: string; slug: string };
type Usage = { activeUsers: number; publishedPages: number; storageBytes: bigint };
type FeatureLimit = { featureCode: string; limitValue: string | null };

async function inSystemTransaction<T>(sql: postgres.Sql, work: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await setSystemRlsContext(tx);
    return work(tx);
  });
}

async function physicalBytes(directory: string): Promise<bigint> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0n;
    throw error;
  }
  let total = 0n;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await physicalBytes(path);
    else if (entry.isFile()) {
      try { total += BigInt((await stat(path)).size); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  return total;
}

async function notifyTenantAdmins(tx: postgres.TransactionSql, tenantId: string, slug: string, type: string, dedupeKey: string, title: string, body: string) {
  const admins = await tx<{ userId: string }[]>`
    select distinct membership.user_id as "userId"
    from tenant_memberships membership
    join membership_roles membership_role on membership_role.membership_id = membership.id and membership_role.tenant_id = membership.tenant_id
    join roles role on role.id = membership_role.role_id
    join users user_account on user_account.id = membership.user_id
    where membership.tenant_id = ${tenantId} and membership.status = 'APPROVED'
      and user_account.global_status = 'ACTIVE' and role.code in ('PRIMARY_ADMIN', 'ADMIN')
  `;
  for (const admin of admins) {
    const inserted = await tx<{ id: string }[]>`
      insert into notifications (id, tenant_id, recipient_user_id, notification_type, dedupe_key, payload)
      values (${randomUUID()}, ${tenantId}, ${admin.userId}, ${type}, ${dedupeKey}, ${JSON.stringify({ title, body, href: `/admin/${slug}` })}::jsonb)
      on conflict (tenant_id, recipient_user_id, dedupe_key) where dedupe_key is not null do nothing
      returning id
    `;
    if (inserted[0]) {
      await tx`insert into notification_deliveries (id, tenant_id, notification_id, channel, status) values (${randomUUID()}, ${tenantId}, ${inserted[0].id}, 'IN_APP', 'DELIVERED')`;
      await tx`insert into notification_deliveries (id, tenant_id, notification_id, channel, status) values (${randomUUID()}, ${tenantId}, ${inserted[0].id}, 'EMAIL', 'PENDING')`;
    }
  }
}

async function currentUsage(tx: postgres.TransactionSql, tenantId: string, storageBytes: bigint): Promise<Usage> {
  const rows = await tx<Usage[]>`
    select
      (select count(*)::integer from tenant_memberships membership join users user_account on user_account.id = membership.user_id
        where membership.tenant_id = ${tenantId} and membership.status = 'APPROVED' and user_account.global_status = 'ACTIVE') as "activeUsers",
      (select count(distinct release_page.page_id)::integer
        from tenants tenant join site_release_pages release_page on release_page.tenant_id = tenant.id and release_page.release_id = tenant.current_release_id
        join pages page on page.tenant_id = release_page.tenant_id and page.id = release_page.page_id and page.deleted_at is null
        join page_versions version on version.tenant_id = release_page.tenant_id and version.id = release_page.page_version_id and version.state = 'PUBLISHED'
        where tenant.id = ${tenantId}) as "publishedPages",
      ${storageBytes.toString()}::bigint as "storageBytes"
  `;
  return rows[0] ?? { activeUsers: 0, publishedPages: 0, storageBytes };
}

async function reconcileTenant(sql: postgres.Sql, tenant: TenantOperation, storageBytes: bigint) {
  await inSystemTransaction(sql, async (tx) => {
    await tx`select id from tenants where id = ${tenant.id} for update`;
    const usage = await currentUsage(tx, tenant.id, storageBytes);
    await tx`
      insert into tenant_usage_counters (tenant_id, active_users, published_pages, storage_bytes, calculated_at)
      values (${tenant.id}, ${usage.activeUsers}, ${usage.publishedPages}, ${usage.storageBytes.toString()}, now())
      on conflict (tenant_id) do update set active_users = excluded.active_users,
        published_pages = excluded.published_pages, storage_bytes = excluded.storage_bytes, calculated_at = now()
    `;

    const limits = await tx<FeatureLimit[]>`
      select entitlement.feature_code as "featureCode",
        case when override.id is not null then override.limit_value else entitlement.limit_value end::text as "limitValue"
      from tenant_contracts contract
      join plan_entitlements entitlement on entitlement.plan_id = contract.plan_id
      left join tenant_entitlement_overrides override on override.tenant_id = contract.tenant_id
        and override.feature_code = entitlement.feature_code and (override.valid_until is null or override.valid_until > now())
      where contract.tenant_id = ${tenant.id} and contract.status = 'ACTIVE'
    `;
    const values: Record<string, number> = {
      active_users: usage.activeUsers,
      published_pages: usage.publishedPages,
      storage_bytes: Number(usage.storageBytes),
    };
    for (const feature of limits) {
      const used = values[feature.featureCode];
      const limit = feature.limitValue === null ? null : Number(feature.limitValue);
      if (used === undefined) continue;
      const open = await tx<{ id: string }[]>`
        select id from quota_alerts where tenant_id = ${tenant.id} and quota_code = ${feature.featureCode}
          and status <> 'RESOLVED' order by created_at desc limit 1 for update
      `;
      if (limit !== null && limit >= 0 && (limit === 0 ? used > 0 : used / limit >= 0.8)) {
        if (open[0]) {
          await tx`update quota_alerts set usage_value = ${used}, limit_value = ${limit} where id = ${open[0].id} and tenant_id = ${tenant.id}`;
        } else {
          const alertId = randomUUID();
          await tx`insert into quota_alerts (id, tenant_id, quota_code, usage_value, limit_value) values (${alertId}, ${tenant.id}, ${feature.featureCode}, ${used}, ${limit})`;
          await notifyTenantAdmins(tx, tenant.id, tenant.slug, "QUOTA_WARNING", `quota:${alertId}`, "Cota próxima do limite", `${feature.featureCode}: ${used.toLocaleString("pt-BR")} de ${limit.toLocaleString("pt-BR")} (${Math.round((used / Math.max(limit, 1)) * 100)}%). Os limites são suaves; entre em contato para revisar o plano.`);
        }
      } else if (open[0]) {
        await tx`update quota_alerts set status = 'RESOLVED' where id = ${open[0].id} and tenant_id = ${tenant.id}`;
      }
    }
  });
}

async function chargeBalance(tx: postgres.TransactionSql, tenantId: string, chargeId: string) {
  const rows = await tx<{ balance: string; dueDate: string }[]>`
    select greatest(charge.charged_amount - coalesce(sum(allocation.allocated_amount) filter (where payment.status = 'CONFIRMED'), 0), 0)::text as balance,
      charge.due_date::text as "dueDate"
    from billing_charges charge
    left join payment_allocations allocation on allocation.tenant_id = charge.tenant_id and allocation.charge_id = charge.id
    left join payments payment on payment.tenant_id = allocation.tenant_id and payment.id = allocation.payment_id
    where charge.tenant_id = ${tenantId} and charge.id = ${chargeId} and charge.status not in ('PAID', 'CANCELLED')
    group by charge.id
  `;
  return rows[0];
}

async function processBilling(sql: postgres.Sql, onlyTenantId?: string) {
  const dueCharges = await inSystemTransaction(sql, (tx) => onlyTenantId
    ? tx<{ id: string; tenantId: string; tenantSlug: string; dueDate: string }[]>`
      select charge.id, charge.tenant_id as "tenantId", tenant.slug as "tenantSlug", charge.due_date::text as "dueDate"
      from billing_charges charge join tenants tenant on tenant.id = charge.tenant_id
      where charge.tenant_id = ${onlyTenantId} and charge.status in ('OPEN', 'OVERDUE') and tenant.operational_status <> 'CLOSED'
        and charge.due_date <= timezone('America/Sao_Paulo', now())::date
      order by charge.due_date, charge.id limit 1000
    `
    : tx<{ id: string; tenantId: string; tenantSlug: string; dueDate: string }[]>`
      select charge.id, charge.tenant_id as "tenantId", tenant.slug as "tenantSlug", charge.due_date::text as "dueDate"
      from billing_charges charge join tenants tenant on tenant.id = charge.tenant_id
      where charge.status in ('OPEN', 'OVERDUE') and tenant.operational_status <> 'CLOSED'
        and charge.due_date <= timezone('America/Sao_Paulo', now())::date
      order by charge.due_date, charge.id limit 1000
    `);
  for (const due of dueCharges) {
    await inSystemTransaction(sql, async (tx) => {
      const tenants = await tx<{ operationalStatus: string; billingStatus: string }[]>`
        select operational_status as "operationalStatus", billing_status as "billingStatus"
        from tenants where id = ${due.tenantId} for update
      `;
      const tenant = tenants[0];
      if (!tenant || tenant.operationalStatus === 'CLOSED') return;
      const balance = await chargeBalance(tx, due.tenantId, due.id);
      if (!balance || Number(balance.balance) <= 0) {
        await tx`update billing_charges set status = 'PAID' where id = ${due.id} and tenant_id = ${due.tenantId} and status in ('OPEN', 'OVERDUE')`;
        return;
      }
      await tx`update billing_charges set status = 'OVERDUE' where id = ${due.id} and tenant_id = ${due.tenantId} and status = 'OPEN'`;
      if (tenant.billingStatus === 'ACTIVE') {
        await tx`update tenants set billing_status = 'OVERDUE', updated_at = now() where id = ${due.tenantId}`;
        await tx`insert into tenant_status_history (id, tenant_id, status_dimension, old_status, new_status, reason)
          values (${randomUUID()}, ${due.tenantId}, 'BILLING', 'ACTIVE', 'OVERDUE', 'Cobrança vencida')`;
      }
      const daysLateRows = await tx<{ daysLate: number }[]>`select (timezone('America/Sao_Paulo', now())::date - ${balance.dueDate}::date)::integer as "daysLate"`;
      const daysLate = daysLateRows[0]?.daysLate ?? 0;
      if (daysLate >= 0) {
        await notifyTenantAdmins(tx, due.tenantId, due.tenantSlug, "BILLING_REMINDER", `billing:${due.id}:DUE`, "Cobrança vencida", `A cobrança com vencimento em ${balance.dueDate} possui saldo aberto de R$ ${Number(balance.balance).toFixed(2)}. Regularize para evitar a suspensão da instância.`);
      }
      if (daysLate >= 5) {
        await notifyTenantAdmins(tx, due.tenantId, due.tenantSlug, "BILLING_REMINDER", `billing:${due.id}:D5`, "Lembrete de cobrança pendente", `A cobrança vencida há ${daysLate} dias continua aberta no valor de R$ ${Number(balance.balance).toFixed(2)}.`);
      }
      if (daysLate < 10 || tenant.operationalStatus !== 'ACTIVE') return;

      const activeSuspensions = await tx<{ id: string }[]>`
        select id from tenant_suspensions where tenant_id = ${due.tenantId} and ended_at is null limit 1
      `;
      if (activeSuspensions[0]) return;
      const suspensionId = randomUUID();
      await tx`
        insert into tenant_suspensions (id, tenant_id, kind, reason, public_message, block_public_access, block_member_login,
          allow_limited_admin_access, block_publication, grace_period_days, automatic, scheduled_for, started_at)
        values (${suspensionId}, ${due.tenantId}, 'COMMERCIAL', 'Atraso financeiro superior a 10 dias',
          'Este site está temporariamente indisponível. Entre em contato com a administração para regularização.',
          true, true, true, true, 10, true, (${balance.dueDate}::date + interval '10 days'), now())
      `;
      await tx`update tenants set operational_status = 'SUSPENDED', billing_status = 'SUSPENDED', updated_at = now() where id = ${due.tenantId}`;
      await tx`insert into tenant_status_history (id, tenant_id, status_dimension, old_status, new_status, reason)
        values (${randomUUID()}, ${due.tenantId}, 'OPERATIONAL', 'ACTIVE', 'SUSPENDED', 'Atraso financeiro superior a 10 dias')`;
      await tx`insert into tenant_status_history (id, tenant_id, status_dimension, old_status, new_status, reason)
        values (${randomUUID()}, ${due.tenantId}, 'BILLING', ${tenant.billingStatus}, 'SUSPENDED', 'Atraso financeiro superior a 10 dias')`;
      await tx`
        insert into audit_events (id, tenant_id, actor_type, action, resource_type, resource_id, request_id, reason, after_data)
        values (${randomUUID()}, ${due.tenantId}, 'SYSTEM', 'TENANT_SUSPENDED_FOR_NONPAYMENT', 'TENANT_SUSPENSION', ${suspensionId}, ${randomUUID()}, 'Atraso financeiro superior a 10 dias',
          ${JSON.stringify({ chargeId: due.id, dueDate: balance.dueDate, daysLate, outstandingAmount: balance.balance, gracePeriodDays: 10 })}::jsonb)
      `;
      await notifyTenantAdmins(tx, due.tenantId, due.tenantSlug, "BILLING_SUSPENDED", `billing:${due.id}:SUSPENDED`, "Instância suspensa por atraso", "O prazo de regularização venceu. O site e novas publicações estão bloqueados; administradores mantêm acesso limitado ao painel.");
    });
  }
}

export async function processPlatformOperations(sql: postgres.Sql) {
  const tenants = await inSystemTransaction(sql, (tx) => tx<TenantOperation[]>`select id, slug from tenants where operational_status <> 'CLOSED' order by id`);
  const root = resolve(process.env.MEDIA_ROOT ?? "./uploads");
  for (const tenant of tenants) {
    const storageBytes = await physicalBytes(join(root, "tenants", tenant.id))
      + await physicalBytes(join(root, "billing-evidence", tenant.id));
    await reconcileTenant(sql, tenant, storageBytes);
  }
  await processBilling(sql);
}

/** Runs reconciliation and billing for one tenant only; used for isolated local acceptance tests. */
export async function processPlatformOperationsForTenant(sql: postgres.Sql, tenantId: string) {
  const tenants = await inSystemTransaction(sql, (tx) => tx<TenantOperation[]>`
    select id, slug from tenants where id = ${tenantId} and operational_status <> 'CLOSED' limit 1
  `);
  const tenant = tenants[0];
  if (!tenant) throw new Error("Tenant ativo não encontrado para reconciliação.");
  const root = resolve(process.env.MEDIA_ROOT ?? "./uploads");
  const storageBytes = await physicalBytes(join(root, "tenants", tenant.id))
    + await physicalBytes(join(root, "billing-evidence", tenant.id));
  await reconcileTenant(sql, tenant, storageBytes);
  await processBilling(sql, tenant.id);
}
