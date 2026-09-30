import Link from "next/link";
import { AdminShell } from "../../components/admin-shell";
import { requireSuperuser } from "../../lib/auth";
import { listApprovedTenantMembers, listTenants } from "../../lib/platform";
import { provisionTenantAction, transferPrimaryAdministratorAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ criada?: string; erro?: string; transferido?: string }> }) {
  const user = await requireSuperuser();
  const [tenants, members, search] = await Promise.all([listTenants(user.id), listApprovedTenantMembers(user.id), searchParams]);
  const { criada, erro, transferido } = search;
  return (
    <AdminShell platform userName={user.displayName}>
      <main className="admin-content">
        <div className="admin-title"><div><span className="eyebrow dark">OPERAÇÃO DA PLATAFORMA</span><h1>Clientes e instâncias.</h1><p>Provisionamento real e isolado por tenant.</p></div><div className="admin-title-actions"><Link className="button button-secondary" href="/platform/finance">Financeiro e operação</Link><Link className="button button-secondary" href="/platform/domains">Domínios</Link><Link className="button button-secondary" href="/platform/suporte">Suporte técnico</Link></div></div>
        {criada && <p className="form-success">Instância <b>{criada}</b> criada com tema-base, Administrador Principal e release inicial.</p>}
        {transferido && <p className="form-success">A nomeação de Administrador Principal de <b>{transferido}</b> foi transferida e auditada.</p>}
        {erro && <p className="form-error">{erro}</p>}
        <section className="metric-grid">
          <article className="metric-card"><span>Instâncias cadastradas</span><strong>{tenants.length}</strong><small>Dados reais do PostgreSQL</small></article>
          <article className="metric-card"><span>Ativas</span><strong>{tenants.filter((tenant) => tenant.operationalStatus === "ACTIVE").length}</strong><small>Operação liberada</small></article>
          <article className="metric-card"><span>Com cobrança ativa</span><strong>{tenants.filter((tenant) => tenant.billingStatus === "ACTIVE").length}</strong><small>Controle financeiro inicial</small></article>
          <article className="metric-card"><span>Tema padrão</span><strong>v1</strong><small>Baixada Base</small></article>
        </section>
        <section className="panel tenant-table"><header><div><span className="eyebrow dark">AUTORIDADE DA INSTÂNCIA</span><h2>Transferir Administrador Principal</h2><p>Somente o Superusuário pode transferir essa nomeação. O atual é rebaixado a Administrador e a alteração fica auditada.</p></div></header>
          <div className="people-list">{tenants.map((tenant) => { const candidates = members.filter((member) => member.tenantId === tenant.id); return <article key={tenant.slug}><div><b>{tenant.displayName}</b><small>{tenant.slug}</small></div><form action={transferPrimaryAdministratorAction} className="support-form"><input type="hidden" name="slug" value={tenant.slug} /><select name="membershipId" required defaultValue=""><option value="" disabled>Selecione novo responsável</option>{candidates.map((candidate) => <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.displayName} — {candidate.email}</option>)}</select><input name="reason" minLength={8} placeholder="Motivo da transferência" required /><button className="button button-secondary" disabled={!candidates.length}>Transferir</button></form></article>; })}{!tenants.length && <p>Nenhuma instância disponível.</p>}</div>
        </section>
        <section className="panel tenant-table"><header><div><span className="eyebrow dark">TENANTS</span><h2>Operação comercial</h2></div></header>
          <div className="table-scroll"><table><thead><tr><th>Instância</th><th>Plano</th><th>Operação</th><th>Cobrança</th><th>Administrador</th></tr></thead><tbody>
            {tenants.map((tenant) => <tr key={tenant.slug}><td><Link href={`/admin/${tenant.slug}`}><b>{tenant.displayName}</b></Link><small>{tenant.slug}.localhost</small></td><td>{tenant.planName}</td><td><span className="pill success">{tenant.operationalStatus}</span></td><td><span className="pill success">{tenant.billingStatus}</span></td><td>{tenant.adminName}</td></tr>)}
            {!tenants.length && <tr><td colSpan={5}>Nenhuma instância criada ainda.</td></tr>}
          </tbody></table></div>
        </section>
        <section className="panel form-panel"><header><div><span className="eyebrow dark">NOVA INSTÂNCIA</span><h2>Provisionar tenant</h2></div></header>
          <form action={provisionTenantAction} className="form-grid">
            <label>Nome exibido<input name="displayName" placeholder="Ex.: Clube Aurora" minLength={3} required /></label>
            <label>Razão social<input name="legalName" placeholder="Ex.: Clube Aurora LTDA" minLength={3} required /></label>
            <label>Identificador / subdomínio<input name="slug" placeholder="clube-aurora" pattern="[a-z0-9-]{3,63}" required /></label>
            <label>Plano<select name="planCode" defaultValue="SIMPLE"><option value="SIMPLE">Simples</option><option value="MEDIUM">Médio</option><option value="UNLIMITED">Ilimitado</option></select></label>
            <label>Administrador Principal<input name="adminName" minLength={3} required /></label>
            <label>E-mail do administrador<input name="adminEmail" type="email" required /></label>
            <label>Senha inicial<input name="adminPassword" type="password" minLength={12} required /></label>
            <div className="form-actions"><button className="button button-primary" type="submit">Criar instância</button><small>O tenant nasce com Baixada Base v1, domínio local e release inicial.</small></div>
          </form>
        </section>
      </main>
    </AdminShell>
  );
}
