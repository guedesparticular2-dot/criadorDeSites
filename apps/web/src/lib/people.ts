import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createDatabaseClient } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";
import { hashPassword, verifyPassword } from "./auth";

export type TenantPerson = {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  status: string;
  relationshipText: string;
  roleCodes: string[];
  requestId: string | null;
  guardianStatus: string | null;
};

export type TenantPermission = { code: string; description: string; defaultGranted: boolean; override: "ALLOW" | "DENY" | null };

function tenantBaseUrl(hostname: string) {
  if (hostname.endsWith(".localhost")) {
    const configured = new URL(process.env.APP_URL ?? "http://localhost:3000");
    return `${configured.protocol}//${hostname}${configured.port ? `:${configured.port}` : ""}`;
  }
  return `https://${hostname}`;
}

export async function createAdminInvitation(tenantId: string, actorUserId: string, input: { name: string; email: string; relationshipText: string }) {
  const inviteeName = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const relationshipText = input.relationshipText.trim();
  if (inviteeName.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || relationshipText.length < 2) {
    throw new Error("Informe nome, e-mail e vínculo válidos para o convite.");
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      const platformActor = await tx<{ isPlatform: boolean }[]>`select exists(select 1 from platform_user_roles pr join roles r on r.id = pr.role_id and r.code = 'SUPERUSER' where pr.user_id = ${actorUserId}) as "isPlatform"`;
      await setRlsContext(tx, platformActor[0]?.isPlatform
        ? { scope: "PLATFORM", userId: actorUserId, tenantId }
        : { scope: "TENANT", userId: actorUserId, tenantId });
      const authority = await tx<{ permitted: boolean }[]>`
        select exists(
          select 1 from tenant_memberships membership
          join tenant_admin_appointments appointment on appointment.tenant_id = membership.tenant_id and appointment.membership_id = membership.id and appointment.valid_until is null
          where membership.tenant_id = ${tenantId} and membership.user_id = ${actorUserId} and membership.status = 'APPROVED'
        ) or exists(
          select 1 from platform_user_roles platform_role join roles role on role.id = platform_role.role_id and role.code = 'SUPERUSER'
          join support_access_sessions support on support.superuser_id = platform_role.user_id and support.tenant_id = ${tenantId} and support.ended_at is null
          where platform_role.user_id = ${actorUserId}
        ) as permitted
      `;
      if (!authority[0]?.permitted) throw new Error("Somente o Administrador Principal pode convidar administradores.");
      const duplicates = await tx<{ exists: boolean }[]>`
        select exists(
          select 1 from tenant_memberships membership join users account on account.id = membership.user_id
          where membership.tenant_id = ${tenantId} and account.email_normalized = ${email}
        ) as exists
      `;
      if (duplicates[0]?.exists) throw new Error("Esta pessoa já possui um vínculo neste clube.");
      const domain = await tx<{ hostname: string; displayName: string }[]>`
        select domain.hostname, tenant.display_name as "displayName"
        from tenant_domains domain join tenants tenant on tenant.id = domain.tenant_id
        where domain.tenant_id = ${tenantId} and domain.is_canonical = true and domain.verification_status = 'VERIFIED' limit 1
      `;
      if (!domain[0]) throw new Error("O clube ainda não possui um domínio canônico para convites.");
      await tx`update tenant_admin_invitations set status = 'REVOKED' where tenant_id = ${tenantId} and email_normalized = ${email} and status = 'PENDING'`;
      const invitationId = randomUUID();
      await tx`
        insert into tenant_admin_invitations (id, tenant_id, email_normalized, invitee_name, relationship_text, token_hash, invited_by, expires_at)
        values (${invitationId}, ${tenantId}, ${email}, ${inviteeName}, ${relationshipText}, ${tokenHash}, ${actorUserId}, now() + interval '7 days')
      `;
      const url = new URL("/convites/administrador", tenantBaseUrl(domain[0].hostname));
      url.searchParams.set("token", token);
      await tx`
        insert into outbox_events (id, tenant_id, event_type, aggregate_type, aggregate_id, payload)
        values (${randomUUID()}, ${tenantId}, 'ADMIN_INVITATION_REQUESTED', 'TENANT_ADMIN_INVITATION', ${invitationId}, ${tx.json({ email, inviteeName, tenantName: domain[0].displayName, url: url.toString(), tokenHash })})
      `;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'ADMIN_INVITATION_CREATED', 'TENANT_ADMIN_INVITATION', ${invitationId}, ${randomUUID()}, ${JSON.stringify({ email, expiresInDays: 7 })}::jsonb)
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function inspectAdminInvitation(token: string) {
  if (token.length < 32 || token.length > 128) return null;
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TOKEN", tokenHash: createHash("sha256").update(token).digest("hex") });
      const rows = await tx<{ name: string; email: string; tenantName: string; tenantSlug: string }[]>`
        select invitation.invitee_name as name, invitation.email_normalized as email,
          tenant.display_name as "tenantName", tenant.slug as "tenantSlug"
        from tenant_admin_invitations invitation join tenants tenant on tenant.id = invitation.tenant_id
        where invitation.token_hash = ${createHash("sha256").update(token).digest("hex")}
          and invitation.status = 'PENDING' and invitation.expires_at > now()
        limit 1
      `;
      return rows[0] ?? null;
    });
  } finally {
    await sql.end();
  }
}

export async function acceptAdminInvitation(token: string, input: { displayName: string; birthDate: string; password: string }) {
  if (token.length < 32 || token.length > 128 || input.password.length < 12 || input.password.length > 256) throw new Error("O convite expirou ou os dados informados são inválidos.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TOKEN", tokenHash });
      const invitations = await tx<{ id: string; tenantId: string; email: string; name: string; relationshipText: string; tenantSlug: string; invitedBy: string }[]>`
        select invitation.id, invitation.tenant_id as "tenantId", invitation.email_normalized as email,
          invitation.invitee_name as name, invitation.relationship_text as "relationshipText", tenant.slug as "tenantSlug",
          invitation.invited_by as "invitedBy"
        from tenant_admin_invitations invitation join tenants tenant on tenant.id = invitation.tenant_id
        where invitation.token_hash = ${tokenHash} and invitation.status = 'PENDING' and invitation.expires_at > now()
        for update of invitation
      `;
      const invitation = invitations[0];
      if (!invitation) throw new Error("O convite expirou ou já foi utilizado.");
      const existing = await tx<{ id: string; passwordHash: string; globalStatus: string }[]>`
        select account.id, credentials.password_hash as "passwordHash", account.global_status as "globalStatus"
        from users account join user_credentials credentials on credentials.user_id = account.id
        where account.email_normalized = ${invitation.email} limit 1 for update of account, credentials
      `;
      let userId: string;
      if (existing[0]) {
        if (existing[0].globalStatus !== "ACTIVE" || !await verifyPassword(input.password, existing[0].passwordHash)) {
          throw new Error("Para aceitar este convite, entre usando a senha atual dessa conta.");
        }
        userId = existing[0].id;
        await tx`update users set mfa_required = true where id = ${userId}`;
      } else {
        if (input.displayName.trim().length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) || Number.isNaN(Date.parse(`${input.birthDate}T00:00:00Z`))) {
          throw new Error("Informe nome e data de nascimento válidos para criar a conta.");
        }
        userId = randomUUID();
        await tx`
          insert into users (id, email, email_normalized, display_name, birth_date, mfa_required)
          values (${userId}, ${invitation.email}, ${invitation.email}, ${input.displayName.trim()}, ${input.birthDate}, true)
        `;
        await tx`insert into user_credentials (user_id, password_hash) values (${userId}, ${await hashPassword(input.password)})`;
      }
      const priorMembership = await tx<{ id: string }[]>`
        select id from tenant_memberships where tenant_id = ${invitation.tenantId} and user_id = ${userId} limit 1
      `;
      if (priorMembership[0]) throw new Error("Esta conta já possui um vínculo neste clube; peça ao Administrador Principal para ajustar o acesso existente.");
      const membershipId = randomUUID();
      await tx`
        insert into tenant_memberships (id, tenant_id, user_id, status, relationship_text, approved_at, approved_by)
        values (${membershipId}, ${invitation.tenantId}, ${userId}, 'APPROVED', ${invitation.relationshipText}, now(), ${invitation.invitedBy ?? null})
      `;
      const adminRole = await tx<{ id: string }[]>`select id from roles where code = 'ADMIN' limit 1`;
      if (!adminRole[0]) throw new Error("Papel de Administrador não configurado.");
      await tx`insert into membership_roles (tenant_id, membership_id, role_id, granted_by) values (${invitation.tenantId}, ${membershipId}, ${adminRole[0].id}, ${invitation.invitedBy ?? null})`;
      await tx`update tenant_admin_invitations set status = 'ACCEPTED', accepted_at = now() where id = ${invitation.id}`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${invitation.tenantId}, ${userId}, 'USER', 'ADMIN_INVITATION_ACCEPTED', 'TENANT_ADMIN_INVITATION', ${invitation.id}, ${randomUUID()}, ${JSON.stringify({ membershipId })}::jsonb)
      `;
      return { tenantSlug: invitation.tenantSlug, userId };
    });
  } finally {
    await sql.end();
  }
}

export async function listTenantAdminPermissions(tenantId: string, membershipId: string, userId: string): Promise<TenantPermission[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      return tx<TenantPermission[]>`
        select permission.code, permission.description,
          exists(select 1 from membership_roles mr join role_permissions rp on rp.role_id = mr.role_id
            where mr.tenant_id = ${tenantId} and mr.membership_id = ${membershipId} and rp.permission_id = permission.id) as "defaultGranted",
          override.effect as override
        from permissions permission
        left join membership_permission_overrides override
          on override.tenant_id = ${tenantId} and override.membership_id = ${membershipId} and override.permission_id = permission.id
        where exists(select 1 from tenant_memberships membership join membership_roles mr on mr.membership_id = membership.id
          join roles role on role.id = mr.role_id where membership.tenant_id = ${tenantId} and membership.id = ${membershipId}
          and membership.status = 'APPROVED' and role.code = 'ADMIN')
        order by permission.module, permission.code
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function isPrimaryTenantAdministrator(tenantId: string, userId: string) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      const rows = await tx<{ isPrimary: boolean }[]>`
        select exists(select 1 from tenant_memberships membership join tenant_admin_appointments appointment
          on appointment.tenant_id = membership.tenant_id and appointment.membership_id = membership.id and appointment.valid_until is null
          where membership.tenant_id = ${tenantId} and membership.user_id = ${userId} and membership.status = 'APPROVED') as "isPrimary"
      `;
      return rows[0]?.isPrimary ?? false;
    });
  } finally { await sql.end(); }
}

export async function setAdminPermissionOverride(tenantId: string, actorUserId: string, membershipId: string, permissionCode: string, effect: "ALLOW" | "DENY" | "DEFAULT") {
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId: actorUserId });
      const target = await tx<{ userId: string; isAdmin: boolean }[]>`
        select membership.user_id as "userId", exists(select 1 from membership_roles mr join roles role on role.id = mr.role_id where mr.membership_id = membership.id and role.code = 'ADMIN') as "isAdmin"
        from tenant_memberships membership where membership.tenant_id = ${tenantId} and membership.id = ${membershipId} and membership.status = 'APPROVED' for update
      `;
      if (!target[0]?.isAdmin) throw new Error("As permissões granulares só podem ser alteradas para um Administrador ativo.");
      const permissions = await tx<{ id: string }[]>`select id from permissions where code = ${permissionCode} limit 1`;
      if (!permissions[0]) throw new Error("Permissão não encontrada.");
      if (effect === "DEFAULT") {
        await tx`delete from membership_permission_overrides where tenant_id = ${tenantId} and membership_id = ${membershipId} and permission_id = ${permissions[0].id}`;
      } else {
        await tx`
          insert into membership_permission_overrides (tenant_id, membership_id, permission_id, effect, changed_by)
          values (${tenantId}, ${membershipId}, ${permissions[0].id}, ${effect}, ${actorUserId})
          on conflict (membership_id, permission_id) do update set effect = excluded.effect, changed_by = excluded.changed_by, changed_at = now()
        `;
      }
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'ADMIN_PERMISSION_CHANGED', 'TENANT_MEMBERSHIP', ${membershipId}, ${randomUUID()}, ${JSON.stringify({ permissionCode, effect })}::jsonb)
      `;
    });
  } finally { await sql.end(); }
}

export async function listTenantPeople(tenantId: string, userId: string): Promise<TenantPerson[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId });
      const rows = await tx<TenantPerson[]>`
        select membership.id as "membershipId", member_user.id as "userId", member_user.display_name as "displayName",
          member_user.email, membership.status, membership.relationship_text as "relationshipText",
          coalesce(array_agg(distinct role.code) filter (where role.code is not null), '{}'::text[]) as "roleCodes",
          registration.id as "requestId", guardian.status as "guardianStatus"
        from tenant_memberships membership
        join users member_user on member_user.id = membership.user_id
        left join membership_roles membership_role on membership_role.membership_id = membership.id
        left join roles role on role.id = membership_role.role_id
        left join registration_requests registration on registration.membership_id = membership.id
        left join guardian_confirmations guardian on guardian.membership_id = membership.id
        where membership.tenant_id = ${tenantId}
        group by membership.id, member_user.id, registration.id, guardian.status
        order by case membership.status when 'PENDING' then 0 else 1 end, member_user.display_name
      `;
      return rows;
    });
  } finally {
    await sql.end();
  }
}

export async function reviewRegistration(tenantId: string, actorUserId: string, requestId: string, decision: "APPROVE" | "REJECT", reason = "") {
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId: actorUserId });
      const requests = await tx<{ membershipId: string; minor: boolean; guardianStatus: string | null }[]>`
        select request.membership_id as "membershipId", coalesce((request.submitted_data ->> 'minor')::boolean, false) as minor,
          guardian.status as "guardianStatus"
        from registration_requests request
        left join guardian_confirmations guardian on guardian.membership_id = request.membership_id
        where request.id = ${requestId} and request.tenant_id = ${tenantId} and request.status = 'PENDING'
        for update of request
      `;
      const request = requests[0];
      if (!request) throw new Error("Solicitação pendente não encontrada.");
      if (decision === "APPROVE" && request.minor && request.guardianStatus !== "CONFIRMED") {
        throw new Error("A confirmação do responsável ainda é necessária para aprovar este menor.");
      }
      const nextStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      await tx`
        update tenant_memberships
        set status = ${nextStatus}, approved_at = ${decision === "APPROVE" ? new Date() : null}, approved_by = ${decision === "APPROVE" ? actorUserId : null},
          rejection_reason = ${decision === "REJECT" ? reason.trim() || "Cadastro não aprovado." : null}, updated_at = now()
        where id = ${request.membershipId} and tenant_id = ${tenantId}
      `;
      await tx`
        update registration_requests
        set status = ${nextStatus}, reviewed_by = ${actorUserId}, reviewed_at = now(), reason = ${reason.trim() || null}, updated_at = now()
        where id = ${requestId} and tenant_id = ${tenantId}
      `;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason)
        values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', ${decision === "APPROVE" ? "REGISTRATION_APPROVED" : "REGISTRATION_REJECTED"}, 'REGISTRATION_REQUEST', ${requestId}, ${randomUUID()}, ${reason.trim() || null})
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function setAdministratorRole(tenantId: string, actorUserId: string, membershipId: string, enabled: boolean) {
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId: actorUserId });
      const memberships = await tx<{ id: string; isPrimary: boolean }[]>`
        select membership.id, exists(
          select 1 from tenant_admin_appointments appointment
          where appointment.membership_id = membership.id and appointment.valid_until is null
        ) as "isPrimary"
        from tenant_memberships membership
        where membership.id = ${membershipId} and membership.tenant_id = ${tenantId} and membership.status = 'APPROVED'
        for update
      `;
      const membership = memberships[0];
      if (!membership) throw new Error("Membro aprovado não encontrado.");
      if (membership.isPrimary) throw new Error("O Administrador Principal só pode ser transferido pelo Superusuário.");
      const adminRole = await tx<{ id: string }[]>`select id from roles where code = 'ADMIN' limit 1`;
      if (!adminRole[0]) throw new Error("Papel administrativo não configurado.");
      if (enabled) {
        await tx`
          insert into membership_roles (tenant_id, membership_id, role_id, granted_by)
          values (${tenantId}, ${membershipId}, ${adminRole[0].id}, ${actorUserId})
          on conflict do nothing
        `;
        await tx`update users set mfa_required = true where id = (select user_id from tenant_memberships where tenant_id = ${tenantId} and id = ${membershipId})`;
      } else {
        await tx`delete from membership_roles where tenant_id = ${tenantId} and membership_id = ${membershipId} and role_id = ${adminRole[0].id}`;
        await tx`
          update users set mfa_required = exists(
            select 1 from tenant_memberships membership
            join membership_roles membership_role on membership_role.membership_id = membership.id
            join roles role on role.id = membership_role.role_id
            where membership.user_id = users.id and membership.status = 'APPROVED' and role.code in ('PRIMARY_ADMIN', 'ADMIN')
          ) or exists(select 1 from platform_user_roles platform_role join roles role on role.id = platform_role.role_id where platform_role.user_id = users.id and role.code = 'SUPERUSER')
          where id = (select user_id from tenant_memberships where tenant_id = ${tenantId} and id = ${membershipId})
        `;
      }
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', ${enabled ? "ADMIN_GRANTED" : "ADMIN_REVOKED"}, 'TENANT_MEMBERSHIP', ${membershipId}, ${randomUUID()}, ${JSON.stringify({ role: "ADMIN" })}::jsonb)
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function suspendMembership(tenantId: string, actorUserId: string, membershipId: string) {
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "TENANT", tenantId, userId: actorUserId });
      const result = await tx<{ id: string }[]>`
        update tenant_memberships membership
        set status = 'SUSPENDED', suspended_at = now(), suspended_by = ${actorUserId}, updated_at = now()
        where membership.id = ${membershipId} and membership.tenant_id = ${tenantId} and membership.status = 'APPROVED'
          and not exists (select 1 from tenant_admin_appointments appointment where appointment.membership_id = membership.id and appointment.valid_until is null)
        returning membership.id
      `;
      if (!result[0]) throw new Error("Não foi possível suspender este vínculo. O Administrador Principal não pode ser suspenso por esta tela.");
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id)
        values (${randomUUID()}, ${tenantId}, ${actorUserId}, 'USER', 'MEMBERSHIP_SUSPENDED', 'TENANT_MEMBERSHIP', ${membershipId}, ${randomUUID()})
      `;
    });
  } finally {
    await sql.end();
  }
}
