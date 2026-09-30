import baseTheme from "../../../../docs/design-tokens/BAIXADA_BASE_v1.json";
import { randomUUID } from "node:crypto";
import { createDatabaseClient, type DatabaseQuery } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";
import { hashPassword } from "./auth";

type ProvisionTenantInput = {
  slug: string;
  displayName: string;
  legalName: string;
  planCode: "SIMPLE" | "MEDIUM" | "UNLIMITED";
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

function normaliseSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function ensureBaseTheme(sql: DatabaseQuery, actorUserId: string) {
  const existing = await sql<{ id: string }[]>`
    select tv.id
    from themes t
    join theme_versions tv on tv.theme_id = t.id
    where t.code = 'BAIXADA_BASE' and tv.status = 'PUBLISHED'
    order by tv.version desc
    limit 1
  `;
  if (existing[0]) return existing[0].id;

  const designSystemVersionId = randomUUID();
  const themeId = randomUUID();
  const themeVersionId = randomUUID();
  const sequence = await sql<{ nextVersion: number }[]>`
    select (coalesce(max(version), 0) + 1)::integer as "nextVersion" from design_system_versions
  `;
  const version = sequence[0]?.nextVersion ?? 1;

  await sql`
    insert into design_system_versions (id, version, status, created_by, published_at)
    values (${designSystemVersionId}, ${version}, 'PUBLISHED', ${actorUserId}, now())
  `;
  for (const [tokenKey, value] of Object.entries(baseTheme.tokens)) {
    await sql`
      insert into design_tokens (id, design_system_version_id, token_key, token_type, value)
      values (${randomUUID()}, ${designSystemVersionId}, ${tokenKey}, 'string', ${JSON.stringify(value)}::jsonb)
    `;
  }
  await sql`
    insert into themes (id, code, name, kind, status)
    values (${themeId}, 'BAIXADA_BASE', 'Baixada Base', 'BAIXADA', 'ACTIVE')
  `;
  await sql`
    insert into theme_versions (id, theme_id, version, design_system_version_id, token_overrides, component_config, status, published_at)
    values (
      ${themeVersionId}, ${themeId}, 1, ${designSystemVersionId}, '{}'::jsonb,
      ${JSON.stringify(baseTheme.componentDefaults)}::jsonb, 'PUBLISHED', now()
    )
  `;
  return themeVersionId;
}

export async function platformIsConfigured() {
  const sql = createDatabaseClient();
  try {
    const rows = await sql<{ configured: boolean }[]>`select exists(select 1 from platform_user_roles) as configured`;
    return rows[0]?.configured ?? false;
  } finally {
    await sql.end();
  }
}

export async function bootstrapPlatform(input: { displayName: string; email: string; password: string }) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(20260924)`;
      const configured = await tx<{ configured: boolean }[]>`select exists(select 1 from platform_user_roles) as configured`;
      if (configured[0]?.configured) throw new Error("A plataforma já possui um Superusuário configurado.");

      const userId = randomUUID();
      const email = input.email.trim().toLowerCase();
      await tx`
        insert into users (id, email, email_normalized, display_name, birth_date, mfa_required)
        values (${userId}, ${email}, ${email}, ${input.displayName.trim()}, '1990-01-01', true)
      `;
      await tx`insert into user_credentials (user_id, password_hash) values (${userId}, ${await hashPassword(input.password)})`;
      const role = await tx<{ id: string }[]>`select id from roles where code = 'SUPERUSER' limit 1`;
      if (!role[0]) throw new Error("Catálogo de papéis não foi inicializado.");
      await tx`insert into platform_user_roles (user_id, role_id) values (${userId}, ${role[0].id})`;
      await ensureBaseTheme(tx, userId);
      await setRlsContext(tx, { scope: "PLATFORM", userId });
      await tx`
        insert into audit_events (id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${userId}, 'USER', 'PLATFORM_BOOTSTRAPPED', 'PLATFORM', null, ${randomUUID()}, ${JSON.stringify({ email })}::jsonb)
      `;
      return { userId };
    });
  } finally {
    await sql.end();
  }
}

export async function provisionTenant(actorUserId: string, input: ProvisionTenantInput) {
  const slug = normaliseSlug(input.slug);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) throw new Error("Use um identificador de 3 a 63 caracteres, com letras, números e hífens.");
  if (input.adminPassword.length < 12) throw new Error("A senha inicial do administrador deve ter ao menos 12 caracteres.");

  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const themeVersionId = await ensureBaseTheme(tx, actorUserId);
      const tenantId = randomUUID();
      const adminEmail = input.adminEmail.trim().toLowerCase();
      const existingAdmin = await tx<{ id: string }[]>`select id from users where email_normalized = ${adminEmail} and global_status = 'ACTIVE' limit 1`;
      const adminUserId = existingAdmin[0]?.id ?? randomUUID();
      if (!existingAdmin[0]) {
        await tx`
          insert into users (id, email, email_normalized, display_name, birth_date, mfa_required)
          values (${adminUserId}, ${adminEmail}, ${adminEmail}, ${input.adminName.trim()}, '1990-01-01', true)
        `;
        await tx`insert into user_credentials (user_id, password_hash) values (${adminUserId}, ${await hashPassword(input.adminPassword)})`;
      }
      const plan = await tx<{ id: string }[]>`select id from plans where code = ${input.planCode} and status = 'ACTIVE' limit 1`;
      const primaryAdminRole = await tx<{ id: string }[]>`select id from roles where code = 'PRIMARY_ADMIN' limit 1`;
      if (!plan[0] || !primaryAdminRole[0]) throw new Error("Catálogos obrigatórios ainda não foram inicializados.");

      await tx`
        insert into tenants (id, slug, legal_name, display_name, operational_status, billing_status, provisioned_at)
        values (${tenantId}, ${slug}, ${input.legalName.trim()}, ${input.displayName.trim()}, 'ACTIVE', 'ACTIVE', now())
      `;
      await tx`
        insert into tenant_domains (id, tenant_id, hostname, kind, is_canonical, verification_status, tls_status, verified_at)
        values (${randomUUID()}, ${tenantId}, ${`${slug}.localhost`}, 'PLATFORM_SUBDOMAIN', true, 'VERIFIED', 'ACTIVE', now())
      `;
      const membershipId = randomUUID();
      await tx`
        insert into tenant_memberships (id, tenant_id, user_id, status, relationship_text, approved_at, approved_by)
        values (${membershipId}, ${tenantId}, ${adminUserId}, 'APPROVED', 'Administrador Principal', now(), ${actorUserId})
      `;
      await tx`insert into membership_roles (tenant_id, membership_id, role_id, granted_by) values (${tenantId}, ${membershipId}, ${primaryAdminRole[0].id}, ${actorUserId})`;
      await tx`
        insert into tenant_admin_appointments (id, tenant_id, membership_id, kind, appointed_by, reason)
        values (${randomUUID()}, ${tenantId}, ${membershipId}, 'PRIMARY_ADMIN', ${actorUserId}, 'Provisionamento inicial')
      `;
      await tx`
        insert into tenant_contracts (id, tenant_id, plan_id, status, start_date, billing_frequency, contracted_amount, recurring_amount, next_due_date)
        values (${randomUUID()}, ${tenantId}, ${plan[0].id}, 'ACTIVE', current_date, 'MONTHLY', 0, 0, current_date + interval '1 month')
      `;
      await tx`insert into tenant_usage_counters (tenant_id) values (${tenantId})`;
      await tx`
        insert into tenant_theme_configs (id, tenant_id, theme_version_id, state, token_overrides, created_by, published_at)
        values (${randomUUID()}, ${tenantId}, ${themeVersionId}, 'PUBLISHED', '{}'::jsonb, ${actorUserId}, now())
      `;

      const pageId = randomUUID();
      const pageVersionId = randomUUID();
      const releaseId = randomUUID();
      await tx`insert into pages (id, tenant_id, page_type, creation_mode, created_by) values (${pageId}, ${tenantId}, 'LANDING', 'TEMPLATE', ${actorUserId})`;
      await tx`
        insert into page_versions (id, tenant_id, page_id, version, title, slug, visibility, indexing_policy, header_mode, state, created_by)
        values (${pageVersionId}, ${tenantId}, ${pageId}, 1, 'Início', '/', 'PUBLIC', 'INDEX', 'REQUIRED', 'PUBLISHED', ${actorUserId})
      `;
      await tx`
        insert into site_releases (id, tenant_id, version, state, published_at, published_by)
        values (${releaseId}, ${tenantId}, 1, 'PUBLISHED', now(), ${actorUserId})
      `;
      await tx`insert into site_release_pages (tenant_id, release_id, page_id, page_version_id) values (${tenantId}, ${releaseId}, ${pageId}, ${pageVersionId})`;
      await tx`update tenants set current_release_id = ${releaseId} where id = ${tenantId}`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'TENANT_PROVISIONED', 'TENANT', ${tenantId}, ${randomUUID()}, ${JSON.stringify({ slug, plan: input.planCode })}::jsonb)
      `;
      return { slug, tenantId };
    });
  } finally {
    await sql.end();
  }
}

export async function listTenants(actorUserId: string) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      return tx<{ id: string; slug: string; displayName: string; planName: string; operationalStatus: string; billingStatus: string; adminName: string }[]>`
      select t.id, t.slug, t.display_name as "displayName", p.name as "planName", t.operational_status as "operationalStatus",
        t.billing_status as "billingStatus", coalesce(admin_user.display_name, 'Sem administrador') as "adminName"
      from tenants t
      left join lateral (
        select c.plan_id from tenant_contracts c where c.tenant_id = t.id and c.status = 'ACTIVE' order by c.created_at desc limit 1
      ) contract on true
      left join plans p on p.id = contract.plan_id
      left join lateral (
        select u.display_name
        from tenant_admin_appointments appointment
        join tenant_memberships membership on membership.id = appointment.membership_id
        join users u on u.id = membership.user_id
        where appointment.tenant_id = t.id and appointment.valid_until is null
        limit 1
      ) admin_user on true
      order by t.created_at desc
      `;
    });
  } finally {
    await sql.end();
  }
}

export type ApprovedTenantMember = { tenantId: string; tenantSlug: string; membershipId: string; displayName: string; email: string };

export async function listApprovedTenantMembers(actorUserId: string): Promise<ApprovedTenantMember[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      return tx<ApprovedTenantMember[]>`
        select membership.tenant_id as "tenantId", tenant.slug as "tenantSlug", membership.id as "membershipId",
          account.display_name as "displayName", account.email
        from tenant_memberships membership
        join tenants tenant on tenant.id = membership.tenant_id
        join users account on account.id = membership.user_id
        where membership.status = 'APPROVED' and account.global_status = 'ACTIVE'
          and tenant.operational_status != 'CLOSED'
        order by tenant.display_name, account.display_name
      `;
    });
  } finally { await sql.end(); }
}

export async function transferPrimaryAdministrator(superuserId: string, tenantSlug: string, targetMembershipId: string, reason: string) {
  if (reason.trim().length < 8) throw new Error("Informe um motivo de transferência com pelo menos oito caracteres.");
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: superuserId });
      const tenants = await tx<{ id: string }[]>`select id from tenants where slug = ${tenantSlug} and operational_status != 'CLOSED' for update`;
      const tenant = tenants[0];
      if (!tenant) throw new Error("Instância não encontrada.");
      await setRlsContext(tx, { scope: "PLATFORM", userId: superuserId, tenantId: tenant.id });
      const active = await tx<{ appointmentId: string; membershipId: string }[]>`
        select id as "appointmentId", membership_id as "membershipId"
        from tenant_admin_appointments where tenant_id = ${tenant.id} and valid_until is null for update
      `;
      const current = active[0];
      const target = await tx<{ userId: string; status: string }[]>`
        select user_id as "userId", status from tenant_memberships
        where tenant_id = ${tenant.id} and id = ${targetMembershipId} for update
      `;
      if (!target[0] || target[0].status !== 'APPROVED') throw new Error("O novo Administrador Principal deve ser um membro aprovado e ativo.");
      if (current?.membershipId === targetMembershipId) throw new Error("Essa pessoa já é o Administrador Principal.");
      const roles = await tx<{ id: string; code: string }[]>`select id, code from roles where code in ('PRIMARY_ADMIN', 'ADMIN')`;
      const primaryRole = roles.find((role) => role.code === 'PRIMARY_ADMIN');
      const adminRole = roles.find((role) => role.code === 'ADMIN');
      if (!primaryRole || !adminRole) throw new Error("Catálogo de papéis administrativos incompleto.");
      if (current) {
        await tx`update tenant_admin_appointments set valid_until = now() where id = ${current.appointmentId} and valid_until is null`;
        await tx`delete from membership_roles where tenant_id = ${tenant.id} and membership_id = ${current.membershipId} and role_id = ${primaryRole.id}`;
        const oldMembership = await tx<{ userId: string; status: string }[]>`select user_id as "userId", status from tenant_memberships where tenant_id = ${tenant.id} and id = ${current.membershipId}`;
        if (oldMembership[0]?.status === 'APPROVED') {
          await tx`insert into membership_roles (tenant_id, membership_id, role_id, granted_by) values (${tenant.id}, ${current.membershipId}, ${adminRole.id}, ${superuserId}) on conflict do nothing`;
        }
      }
      await tx`delete from membership_roles where tenant_id = ${tenant.id} and membership_id = ${targetMembershipId} and role_id = ${adminRole.id}`;
      await tx`insert into membership_roles (tenant_id, membership_id, role_id, granted_by) values (${tenant.id}, ${targetMembershipId}, ${primaryRole.id}, ${superuserId}) on conflict do nothing`;
      await tx`insert into tenant_admin_appointments (id, tenant_id, membership_id, kind, appointed_by, reason) values (${randomUUID()}, ${tenant.id}, ${targetMembershipId}, 'PRIMARY_ADMIN', ${superuserId}, ${reason.trim()})`;
      await tx`update users set mfa_required = true where id = ${target[0].userId}`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, before_data, after_data, reason)
        values (${randomUUID()}, ${tenant.id}, ${superuserId}, 'USER', 'PRIMARY_ADMIN_TRANSFERRED', 'TENANT_ADMIN_APPOINTMENT', ${current?.appointmentId ?? null}, ${randomUUID()}, ${JSON.stringify({ previousMembershipId: current?.membershipId ?? null })}::jsonb, ${JSON.stringify({ nextMembershipId: targetMembershipId })}::jsonb, ${reason.trim()})
      `;
    });
  } finally { await sql.end(); }
}
