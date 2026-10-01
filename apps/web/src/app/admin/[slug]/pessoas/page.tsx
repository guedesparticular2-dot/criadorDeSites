import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "../../../../components/admin-shell";
import { requireCurrentUser } from "../../../../lib/auth";
import { isPrimaryTenantAdministrator, listTenantAdminPermissions, listTenantPeople } from "../../../../lib/people";
import { hasTenantPermission, requireTenantAdministrator } from "../../../../lib/tenant";
import { createAdminInvitationAction, reviewRegistrationAction, setAdminPermissionOverrideAction, setAdministratorRoleAction, suspendMembershipAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ atualizado?: string; erro?: string; convite?: string; permissao?: string }> }) {
  const user = await requireCurrentUser();
  const { slug } = await params;
  let tenant;
  try {
    tenant = await requireTenantAdministrator(slug, user);
  } catch {
    redirect(`/admin/${slug}?erro=acesso-negado`);
  }
  const [canManagePeople, canApprovePeople] = user.isSuperuser
    ? [true, true]
    : await Promise.all([hasTenantPermission(tenant, user, "people.manage"), hasTenantPermission(tenant, user, "people.approve")]);
  if (!canManagePeople && !canApprovePeople) redirect(`/admin/${slug}?erro=acesso-negado`);
  const [people, isPrimary, search] = await Promise.all([listTenantPeople(tenant.id, user.id), isPrimaryTenantAdministrator(tenant.id, user.id), searchParams]);
  const canManagePermissions = user.isSuperuser || isPrimary;
  const administratorPermissions = canManagePermissions
    ? Object.fromEntries(await Promise.all(people.filter((person) => person.status === "APPROVED" && person.roleCodes.includes("ADMIN")).map(async (person) => [person.membershipId, await listTenantAdminPermissions(tenant.id, person.membershipId, user.id)] as const)))
    : {};
  const { atualizado, erro, convite, permissao } = search;
  return (
    <AdminShell tenantName={tenant.displayName} tenantSlug={tenant.slug} userName={user.displayName} isSuperuser={user.isSuperuser} activeSection="people">
      <main className="admin-content">
        <div className="admin-title"><div><span className="eyebrow dark">PESSOAS</span><h1>Vínculos e acessos.</h1><p>Aprove cadastros, nomeie administradores e suspenda vínculos sem afetar outras instâncias.</p></div><Link className="button button-secondary" href={`/admin/${slug}`}>Voltar ao painel</Link></div>
        {atualizado && <p className="form-success">Alteração registrada e auditada.</p>}{convite && <p className="form-success">Convite criado e encaminhado para a fila segura de e-mail.</p>}{permissao && <p className="form-success">Permissão atualizada e auditada.</p>}{erro && <p className="form-error">{erro}</p>}
        {canManagePeople && (user.isSuperuser || isPrimary) && <section className="panel form-panel"><header><div><span className="eyebrow dark">NOVO ACESSO ADMINISTRATIVO</span><h2>Convidar administrador</h2></div></header>
          <p>O convite expira em sete dias. A pessoa configura a própria conta e, no primeiro acesso, será obrigada a ativar MFA. O envio depende do transporte de e-mail configurado para a plataforma.</p>
          <form action={createAdminInvitationAction} className="form-grid">
            <input type="hidden" name="slug" value={slug} />
            <label>Nome<input name="name" minLength={3} required /></label>
            <label>E-mail<input name="email" type="email" required /></label>
            <label className="form-grid-wide">Vínculo com o clube<input name="relationshipText" placeholder="Ex.: comissão técnica, comunicação" required /></label>
            <div className="form-actions"><button className="button button-primary" type="submit">Criar convite</button></div>
          </form>
        </section>}
        {canApprovePeople && <section className="panel"><header><div><span className="eyebrow dark">FILA DE CADASTRO</span><h2>Solicitações pendentes</h2></div></header>
          <div className="people-list">{people.filter((person) => person.status === "PENDING").map((person) => <article key={person.membershipId}><div><b>{person.displayName}</b><small>{person.email} · {person.relationshipText}{person.guardianStatus ? ` · responsável: ${person.guardianStatus}` : ""}</small></div>{person.requestId && <div className="people-actions"><form action={reviewRegistrationAction}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="requestId" value={person.requestId} /><input type="hidden" name="decision" value="APPROVE" /><button className="button button-primary">Aprovar</button></form><form action={reviewRegistrationAction}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="requestId" value={person.requestId} /><input type="hidden" name="decision" value="REJECT" /><button className="button button-secondary">Rejeitar</button></form></div>}</article>)}{!people.some((person) => person.status === "PENDING") && <p>Nenhum cadastro aguardando análise.</p>}</div>
        </section>}
        {canManagePeople && <section className="panel people-panel"><header><div><span className="eyebrow dark">MEMBROS</span><h2>Acessos administrativos</h2></div></header>
          <div className="people-list">{people.filter((person) => person.status === "APPROVED").map((person) => { const isPrimaryPerson = person.roleCodes.includes("PRIMARY_ADMIN"); const isAdmin = person.roleCodes.includes("ADMIN"); const permissions = administratorPermissions[person.membershipId] ?? []; return <article key={person.membershipId}><div><b>{person.displayName}</b><small>{person.email} · {person.roleCodes.join(", ") || "USER"}</small></div><div className="people-actions">{!isPrimaryPerson && <form action={setAdministratorRoleAction}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="membershipId" value={person.membershipId} /><input type="hidden" name="enabled" value={isAdmin ? "false" : "true"} /><button className="button button-secondary">{isAdmin ? "Remover admin" : "Tornar admin"}</button></form>}{!isPrimaryPerson && <form action={suspendMembershipAction}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="membershipId" value={person.membershipId} /><button className="button button-secondary">Suspender</button></form>}</div>{isAdmin && canManagePermissions && <details className="permission-details"><summary>Permissões granulares</summary><div className="permission-list">{permissions.map((permission) => <form key={permission.code} action={setAdminPermissionOverrideAction}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="membershipId" value={person.membershipId} /><input type="hidden" name="permissionCode" value={permission.code} /><span><b>{permission.description}</b><small>{permission.code} · padrão: {permission.defaultGranted ? "permitida" : "não permitida"}</small></span><select name="effect" defaultValue={permission.override ?? "DEFAULT"} aria-label={`Permissão ${permission.description}`}><option value="DEFAULT">Usar padrão</option><option value="ALLOW">Permitir</option><option value="DENY">Negar</option></select><button className="button button-secondary">Salvar</button></form>)}</div></details>}</article>; })}{!people.some((person) => person.status === "APPROVED") && <p>Nenhum membro aprovado.</p>}</div>
        </section>}
      </main>
    </AdminShell>
  );
}
