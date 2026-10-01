import Link from "next/link";
import { AdminShell } from "../../../components/admin-shell";
import { requireSuperuser } from "../../../lib/auth";
import { listTenants } from "../../../lib/platform";
import { listActiveSupportAccess } from "../../../lib/tenant";
import { endSupportAccessAction, startSupportAccessAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ erro?: string; encerrado?: string }> }) {
  const user = await requireSuperuser();
  const [tenants, activeSessions, params] = await Promise.all([listTenants(user.id), listActiveSupportAccess(user), searchParams]);
  return <AdminShell platform userName={user.displayName} activeSection="support"><main className="admin-content"><div className="admin-title"><div><span className="eyebrow dark">SUPORTE IDENTIFICADO</span><h1>Acessos técnicos.</h1><p>O Superusuário não personifica ninguém: toda entrada em tenant exige motivo e deixa trilha de auditoria.</p></div><Link className="button button-secondary" href="/platform">Plataforma</Link></div>{params.erro && <p className="form-error">{params.erro}</p>}{params.encerrado && <p className="form-success">Sessão de suporte encerrada.</p>}<section className="panel"><header><div><span className="eyebrow dark">ABRIR SUPORTE</span><h2>Selecione a instância</h2></div></header><div className="people-list">{tenants.map((tenant) => <article key={tenant.slug}><div><b>{tenant.displayName}</b><small>{tenant.slug}.localhost · {tenant.operationalStatus}</small></div><form action={startSupportAccessAction} className="support-form"><input type="hidden" name="slug" value={tenant.slug}/><input name="reason" minLength={8} placeholder="Motivo do suporte" required/><button className="button button-primary">Abrir suporte</button></form></article>)}</div></section><section className="panel people-panel"><header><div><span className="eyebrow dark">SESSÕES ATIVAS</span><h2>Em andamento</h2></div></header><div className="people-list">{activeSessions.map((session) => <article key={session.id}><div><b>{session.tenantName}</b><small>{session.reason} · iniciado às {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(session.startedAt)}</small></div><form action={endSupportAccessAction}><input type="hidden" name="sessionId" value={session.id}/><button className="button button-secondary">Encerrar</button></form></article>)}{!activeSessions.length && <p>Nenhuma sessão de suporte ativa.</p>}</div></section></main></AdminShell>;
}
