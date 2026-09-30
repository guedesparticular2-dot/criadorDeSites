import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";
import { requireCurrentUser } from "../../../lib/auth";
import { getTenantOperationalOverview } from "../../../lib/platform-operations";
import { listTenantAuditEvents, requireTenantAdministrator } from "../../../lib/tenant";
import { updateAppearanceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TenantAdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ atualizado?: string; erro?: string }> }) {
  const user = await requireCurrentUser();
  const { slug } = await params;
  const { atualizado, erro } = await searchParams;
  let tenant;
  try {
    tenant = await requireTenantAdministrator(slug, user, { allowLimitedSuspendedAccess: true });
  } catch {
    redirect("/acesso?erro=acesso-negado");
  }
  const limitedSuspendedAccess = tenant.operationalStatus === "SUSPENDED" && !user.isSuperuser;
  const auditEvents = limitedSuspendedAccess ? [] : await listTenantAuditEvents(tenant.id, user.id, user.isSuperuser);
  const overview = !user.isSuperuser ? await getTenantOperationalOverview(tenant.id, user.id) : null;
  const entitlement = Object.fromEntries((overview?.limits ?? []).map((item) => [item.featureCode, item.limitValue]));
  const overviewUsage = overview?.usage;
  const formatBytes = (value: string) => {
    const amount = Number(value);
    if (amount < 1024) return `${amount} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let scaled = amount / 1024;
    let unit = units[0]!;
    for (let index = 1; scaled >= 1024 && index < units.length; index += 1) { scaled /= 1024; unit = units[index]!; }
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(scaled)} ${unit}`;
  };
  return (
    <AdminShell tenantName={tenant.displayName} userName={user.displayName} platform={user.isSuperuser}>
      <main className="admin-content">
        <div className="admin-title"><div><span className="eyebrow dark">INSTÂNCIA ATUAL</span><h1>{tenant.displayName}</h1><p>{limitedSuspendedAccess ? "O acesso está limitado enquanto a instância estiver suspensa." : "Altere a identidade do clube e publique uma nova configuração de aparência."}</p></div><div className="admin-title-actions">{!limitedSuspendedAccess && <><Link className="button button-secondary" href={`/admin/${tenant.slug}/conteudo`}>Conteúdo</Link><Link className="button button-secondary" href={`/admin/${tenant.slug}/midia`}>Mídia</Link><Link className="button button-secondary" href={`/admin/${tenant.slug}/moderacao`}>Moderação</Link><Link className="button button-secondary" href={`/admin/${tenant.slug}/pessoas`}>Pessoas</Link></>}{user.isSuperuser && <Link className="button button-secondary" href="/platform">Plataforma</Link>}</div></div>
        {atualizado && <p className="form-success">Aparência publicada. A versão anterior foi preservada no histórico.</p>}
        {erro && <p className="form-error">{erro}</p>}
        {limitedSuspendedAccess ? <section className="panel tenant-suspended-notice"><span className="eyebrow dark">SUSPENSÃO ATIVA</span><h2>Esta instância está temporariamente suspensa.</h2><p>O site público, o acesso de membros e novas publicações estão bloqueados. Para consultar a situação e iniciar a regularização, fale com o Superusuário responsável pela plataforma.</p><dl><div><dt>Status operacional</dt><dd>{tenant.operationalStatus}</dd></div><div><dt>Status financeiro</dt><dd>{tenant.billingStatus}</dd></div></dl>{overviewUsage && <div className="tenant-usage-summary"><b>Consumo registrado</b><span>{overviewUsage.activeUsers}/{entitlement.active_users ?? "∞"} usuários</span><span>{overviewUsage.publishedPages}/{entitlement.published_pages ?? "∞"} páginas publicadas</span><span>{formatBytes(overviewUsage.storageBytes)}/{entitlement.storage_bytes == null ? "∞" : formatBytes(String(entitlement.storage_bytes))}</span></div>}{overview?.notifications.length ? <ol className="tenant-notifications">{overview.notifications.map((notification) => <li key={notification.id}><b>{String(notification.payload.title ?? notification.type)}</b><p>{String(notification.payload.body ?? "")}</p><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(notification.createdAt)}</small></li>)}</ol> : null}</section> : <>
        {overview && <section className="panel tenant-operational-overview"><header><div><span className="eyebrow dark">CONSUMO E AVISOS</span><h2>Operação da instância</h2></div><small>Consumo reconciliado periodicamente pelo sistema.</small></header>
          <div className="tenant-usage-summary"><span>{overview.usage.activeUsers}/{entitlement.active_users ?? "∞"} usuários aprovados</span><span>{overview.usage.publishedPages}/{entitlement.published_pages ?? "∞"} páginas publicadas</span><span>{formatBytes(overview.usage.storageBytes)}/{entitlement.storage_bytes == null ? "∞" : formatBytes(String(entitlement.storage_bytes))}</span></div>
          {overview.notifications.length ? <ol className="tenant-notifications">{overview.notifications.map((notification) => <li key={notification.id}><b>{String(notification.payload.title ?? notification.type)}</b><p>{String(notification.payload.body ?? "")}</p><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(notification.createdAt)}</small></li>)}</ol> : <p>Nenhum aviso operacional pendente.</p>}
        </section>}
        <section className="panel form-panel">
          <header><div><span className="eyebrow dark">APARÊNCIA</span><h2>Identidade do tenant</h2></div><span className="release-live">PUBLICADO</span></header>
          <form action={updateAppearanceAction} className="form-grid">
            <input type="hidden" name="slug" value={tenant.slug} />
            <label>Nome exibido<input name="displayName" defaultValue={tenant.displayName} minLength={3} required /></label>
            <label>Razão social<input name="legalName" defaultValue={tenant.legalName} minLength={3} required /></label>
            <label>Azul da marca<input name="blue" defaultValue={tenant.themeOverrides["color.brand.blue"] ?? "#1E638C"} pattern="#[0-9a-fA-F]{6}" /></label>
            <label>Verde da marca<input name="green" defaultValue={tenant.themeOverrides["color.brand.green"] ?? "#247348"} pattern="#[0-9a-fA-F]{6}" /></label>
            <div className="form-actions"><button className="button button-primary" type="submit">Publicar aparência</button><Link href={`http://${tenant.slug}.localhost:3000/`} target="_blank">Abrir site público</Link></div>
          </form>
        </section>
        <section className="panel audit-panel"><header><div><span className="eyebrow dark">AUDITORIA</span><h2>Alterações rastreáveis</h2></div></header>
          <ol className="audit-list">
            {auditEvents.map((event) => <li key={event.id}><div><b>{event.action.replaceAll("_", " ")}</b><small>{event.actorName ?? "Sistema"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}</small></div><span>{event.resourceType}</span></li>)}
            {!auditEvents.length && <li><div><b>Nenhuma alteração registrada.</b><small>As próximas publicações aparecerão aqui.</small></div></li>}
          </ol>
        </section>
        <section className="panel"><header><div><span className="eyebrow dark">PRÓXIMA FATIA</span><h2>Conteúdo e releases</h2></div></header><p>O tenant já possui tema, domínio, Administrador Principal e release inicial. A próxima tela conectará notícias, agenda, partidas e páginas a essa release.</p></section>
        </>}
      </main>
    </AdminShell>
  );
}
