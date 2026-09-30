import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";
import type { AuthenticatedUser } from "./auth";

export type TenantSummary = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  operationalStatus: string;
  billingStatus: string;
  themeOverrides: Record<string, string>;
};

export type AuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  actorName: string | null;
  afterData: Record<string, unknown> | null;
  occurredAt: Date;
};

export type TenantContext = {
  slug: string;
  displayName: string;
  roleCode: "PRIMARY_ADMIN" | "ADMIN";
};

export type SupportAccessSession = { id: string; tenantId: string; tenantName: string; startedAt: Date; reason: string };

function normaliseHost(host: string) {
  const hostname = host.toLowerCase().split(":")[0] ?? "";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "baixada.localhost";
  return hostname;
}

export async function getTenantBySlug(slug: string): Promise<TenantSummary | null> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      const rows = await tx<TenantSummary[]>`
        select t.id, t.slug, t.display_name as "displayName", t.legal_name as "legalName",
          t.operational_status as "operationalStatus", t.billing_status as "billingStatus", '{}'::jsonb as "themeOverrides"
        from tenants t
        where t.slug = ${slug} and t.operational_status != 'CLOSED'
        limit 1
      `;
      return rows[0] ?? null;
    });
  } finally {
    await sql.end();
  }
}

export async function getTenantFromHost(host: string) {
  const hostname = normaliseHost(host);
  if (!hostname) return null;
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      const tenants = await tx<TenantSummary[]>`
        select id, slug, display_name as "displayName", legal_name as "legalName",
          operational_status as "operationalStatus", billing_status as "billingStatus", '{}'::jsonb as "themeOverrides"
        from app.resolve_public_tenant(${hostname})
      `;
      const tenant = tenants[0];
      if (!tenant) return null;
      await setRlsContext(tx, { scope: "PUBLIC", tenantId: tenant.id });
      const themes = await tx<{ themeOverrides: Record<string, string> }[]>`
        select token_overrides as "themeOverrides" from tenant_theme_configs
        where tenant_id = ${tenant.id} and state = 'PUBLISHED'
        order by published_at desc nulls last, created_at desc limit 1
      `;
      return { ...tenant, themeOverrides: themes[0]?.themeOverrides ?? {} };
    });
  } finally {
    await sql.end();
  }
}

export async function listAdministrativeTenantContexts(user: AuthenticatedUser): Promise<TenantContext[]> {
  if (user.isSuperuser) return [];
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", userId: user.id });
      return tx<TenantContext[]>`
        select distinct t.slug, t.display_name as "displayName", role.code as "roleCode"
        from tenant_memberships membership
        join membership_roles membership_role on membership_role.membership_id = membership.id
        join roles role on role.id = membership_role.role_id
        join tenants t on t.id = membership.tenant_id
        where membership.user_id = ${user.id}
          and membership.status = 'APPROVED'
          and t.operational_status in ('ACTIVE', 'SUSPENDED')
          and role.code in ('PRIMARY_ADMIN', 'ADMIN')
        order by t.display_name
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function requireTenantAdministrator(slug: string, user: AuthenticatedUser, options: { allowLimitedSuspendedAccess?: boolean } = {}) {
  if (!user.isSuperuser && !user.isAdministrative) {
    throw new Error("Este acesso não passou pelo segundo fator administrativo. Entre novamente para confirmar o MFA.");
  }
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      const tenantRows = await tx<{ id: string; slug: string; displayName: string; legalName: string; operationalStatus: string; billingStatus: string }[]>`
        select t.id, t.slug, t.display_name as "displayName", t.legal_name as "legalName",
          t.operational_status as "operationalStatus", t.billing_status as "billingStatus"
        from tenants t
        where t.slug = ${slug}
        limit 1
      `;
      const tenant = tenantRows[0];
      if (!tenant) throw new Error("Instância não encontrada.");

      await setRlsContext(tx, user.isSuperuser
        ? { scope: "PLATFORM", userId: user.id, tenantId: tenant.id }
        : { scope: "TENANT", userId: user.id, tenantId: tenant.id });
      const themeRows = await tx<{ themeOverrides: Record<string, string> }[]>`
        select coalesce(token_overrides, '{}'::jsonb) as "themeOverrides"
        from tenant_theme_configs
        where tenant_id = ${tenant.id} and state = 'PUBLISHED'
        order by published_at desc nulls last, created_at desc
        limit 1
      `;
      const tenantWithTheme = { ...tenant, themeOverrides: themeRows[0]?.themeOverrides ?? {} };
      if (user.isSuperuser) {
        const support = await tx<{ id: string }[]>`
          select id from support_access_sessions
          where tenant_id = ${tenant.id} and superuser_id = ${user.id} and ended_at is null
          limit 1
        `;
        if (!support[0]) throw new Error("Abra uma sessão de suporte identificada antes de acessar esta instância.");
        return tenantWithTheme;
      }

      const roles = await tx<{ permitted: boolean }[]>`
        select exists(
          select 1
          from tenant_memberships membership
          join membership_roles membership_role on membership_role.membership_id = membership.id
          join roles role on role.id = membership_role.role_id
          where membership.tenant_id = ${tenant.id}
            and membership.user_id = ${user.id}
            and membership.status = 'APPROVED'
            and role.code in ('PRIMARY_ADMIN', 'ADMIN')
        ) as permitted
      `;
      if (!roles[0]?.permitted) throw new Error("Você não possui permissão administrativa nesta instância.");
      if (tenant.operationalStatus === "SUSPENDED" && !options.allowLimitedSuspendedAccess) {
        throw new Error("Esta instância está suspensa. O acesso administrativo está limitado à consulta da situação e regularização.");
      }
      return tenantWithTheme;
    });
  } finally {
    await sql.end();
  }
}

export async function startSupportAccess(user: AuthenticatedUser, slug: string, reason: string) {
  if (!user.isSuperuser) throw new Error("Somente o Superusuário pode abrir suporte técnico.");
  if (reason.trim().length < 8) throw new Error("Informe um motivo de suporte com pelo menos oito caracteres.");
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: user.id });
      const tenants = await tx<{ id: string; displayName: string }[]>`select id, display_name as "displayName" from tenants where slug = ${slug} and operational_status != 'CLOSED' limit 1`;
      const tenant = tenants[0];
      if (!tenant) throw new Error("Instância não encontrada.");
      const existing = await tx<{ id: string }[]>`select id from support_access_sessions where tenant_id = ${tenant.id} and superuser_id = ${user.id} and ended_at is null limit 1`;
      const sessionId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) {
        await tx`insert into support_access_sessions (id, tenant_id, superuser_id, reason, request_id) values (${sessionId}, ${tenant.id}, ${user.id}, ${reason.trim()}, ${randomUUID()})`;
        await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason) values (${randomUUID()}, ${tenant.id}, ${user.id}, 'USER', 'SUPPORT_ACCESS_STARTED', 'SUPPORT_ACCESS_SESSION', ${sessionId}, ${randomUUID()}, ${reason.trim()})`;
      }
      return { tenantSlug: slug, tenantName: tenant.displayName, sessionId };
    });
  } finally { await sql.end(); }
}

export async function endSupportAccess(user: AuthenticatedUser, sessionId: string) {
  if (!user.isSuperuser) throw new Error("Somente o Superusuário pode encerrar suporte técnico.");
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: user.id });
      const sessions = await tx<{ tenantId: string }[]>`update support_access_sessions set ended_at = now() where id = ${sessionId} and superuser_id = ${user.id} and ended_at is null returning tenant_id as "tenantId"`;
      const session = sessions[0];
      if (!session) throw new Error("Sessão de suporte ativa não encontrada.");
      await tx`insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id) values (${randomUUID()}, ${session.tenantId}, ${user.id}, 'USER', 'SUPPORT_ACCESS_ENDED', 'SUPPORT_ACCESS_SESSION', ${sessionId}, ${randomUUID()})`;
    });
  } finally { await sql.end(); }
}

export async function listActiveSupportAccess(user: AuthenticatedUser): Promise<SupportAccessSession[]> {
  if (!user.isSuperuser) return [];
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: user.id });
      return tx<SupportAccessSession[]>`
        select session.id, session.tenant_id as "tenantId", tenant.display_name as "tenantName", session.started_at as "startedAt", session.reason
        from support_access_sessions session join tenants tenant on tenant.id = session.tenant_id
        where session.superuser_id = ${user.id} and session.ended_at is null order by session.started_at desc
      `;
    });
  } finally { await sql.end(); }
}

export async function hasTenantPermission(
  tenant: { id: string },
  user: AuthenticatedUser,
  permissionCode: string,
) {
  if (user.isSuperuser) return true;
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", userId: user.id, tenantId: tenant.id });
      const rows = await tx<{ permitted: boolean }[]>`
        with current_membership as (
          select id
          from tenant_memberships
          where tenant_id = ${tenant.id} and user_id = ${user.id} and status = 'APPROVED'
          limit 1
        ), override as (
          select permission_override.effect
          from membership_permission_overrides permission_override
          join permissions permission on permission.id = permission_override.permission_id
          join current_membership membership on membership.id = permission_override.membership_id
          where permission.code = ${permissionCode}
        )
        select case
          when exists (select 1 from override where effect = 'DENY') then false
          when exists (select 1 from override where effect = 'ALLOW') then true
          else exists (
            select 1
            from current_membership membership
            join membership_roles membership_role on membership_role.membership_id = membership.id
            join role_permissions role_permission on role_permission.role_id = membership_role.role_id
            join permissions permission on permission.id = role_permission.permission_id
            where permission.code = ${permissionCode}
          )
        end as permitted
      `;
      return rows[0]?.permitted ?? false;
    });
  } finally {
    await sql.end();
  }
}

export async function requireTenantPermission(slug: string, user: AuthenticatedUser, permissionCode: string) {
  const tenant = await requireTenantAdministrator(slug, user);
  if (!await hasTenantPermission(tenant, user, permissionCode)) {
    throw new Error("Você não possui a permissão necessária para esta ação.");
  }
  return tenant;
}

function colourOrEmpty(value: string) {
  const normalised = value.trim().toUpperCase();
  if (!normalised) return null;
  if (!/^#[0-9A-F]{6}$/.test(normalised)) throw new Error("As cores devem estar no formato hexadecimal, por exemplo #1E638C.");
  return normalised;
}

export async function updateTenantAppearance(
  tenant: { id: string; displayName: string; legalName: string; themeOverrides: Record<string, string> },
  actorUserId: string,
  input: { displayName: string; legalName: string; blue: string; green: string },
) {
  const nextOverrides = {
    ...tenant.themeOverrides,
    ...(colourOrEmpty(input.blue) ? { "color.brand.blue": colourOrEmpty(input.blue) } : {}),
    ...(colourOrEmpty(input.green) ? { "color.brand.green": colourOrEmpty(input.green) } : {}),
  };
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", userId: actorUserId, tenantId: tenant.id });
      const current = await tx<{ themeVersionId: string }[]>`
        select theme_version_id as "themeVersionId"
        from tenant_theme_configs
        where tenant_id = ${tenant.id} and state = 'PUBLISHED'
        limit 1
      `;
      if (!current[0]) throw new Error("A instância não possui um tema publicado.");
      await tx`
        update tenants set display_name = ${input.displayName.trim()}, legal_name = ${input.legalName.trim()}, updated_at = now()
        where id = ${tenant.id}
      `;
      await tx`update tenant_theme_configs set state = 'SUPERSEDED' where tenant_id = ${tenant.id} and state = 'PUBLISHED'`;
      await tx`
        insert into tenant_theme_configs (id, tenant_id, theme_version_id, state, token_overrides, created_by, published_at)
        values (${randomUUID()}, ${tenant.id}, ${current[0].themeVersionId}, 'PUBLISHED', ${JSON.stringify(nextOverrides)}::jsonb, ${actorUserId}, now())
      `;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, before_data, after_data)
        values (
          ${randomUUID()}, ${tenant.id}, ${actorUserId}, 'USER', 'TENANT_APPEARANCE_PUBLISHED', 'TENANT', ${tenant.id}, ${randomUUID()},
          ${JSON.stringify({ displayName: tenant.displayName, legalName: tenant.legalName, themeOverrides: tenant.themeOverrides })}::jsonb,
          ${JSON.stringify({ displayName: input.displayName.trim(), legalName: input.legalName.trim(), themeOverrides: nextOverrides })}::jsonb
        )
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function listTenantAuditEvents(tenantId: string, userId: string, isSuperuser = false, limit = 12): Promise<AuditEvent[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, isSuperuser
        ? { scope: "PLATFORM", tenantId, userId }
        : { scope: "TENANT", tenantId, userId });
      return tx<AuditEvent[]>`
      select event.id, event.action, event.resource_type as "resourceType", actor.display_name as "actorName",
        event.after_data as "afterData", event.occurred_at as "occurredAt"
      from audit_events event
      left join users actor on actor.id = event.actor_user_id
      where event.tenant_id = ${tenantId}
      order by event.occurred_at desc, event.id desc
      limit ${limit}
      `;
    });
  } finally {
    await sql.end();
  }
}
