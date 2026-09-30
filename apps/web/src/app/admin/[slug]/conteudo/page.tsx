import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "../../../../components/admin-shell";
import { requireCurrentUser } from "../../../../lib/auth";
import { listTenantContent } from "../../../../lib/content";
import { requireTenantPermission } from "../../../../lib/tenant";
import { createNewsDraftAction, createNoticeDraftAction, createPollDraftAction, publishContentReleaseAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ rascunho?: string; publicado?: string; enquete?: string; aviso?: string; erro?: string }> }) {
  const user = await requireCurrentUser();
  const { slug } = await params;
  let tenant;
  try {
    tenant = await requireTenantPermission(slug, user, "content.edit");
  } catch {
    redirect(`/admin/${slug}?erro=acesso-negado`);
  }
  const content = await listTenantContent(tenant.id, user.id);
  const { rascunho, publicado, enquete, aviso, erro } = await searchParams;
  return (
    <AdminShell tenantName={tenant.displayName} userName={user.displayName} platform={user.isSuperuser}>
      <main className="admin-content">
        <div className="admin-title"><div><span className="eyebrow dark">CONTEÚDO</span><h1>Histórias do clube.</h1><p>Crie rascunhos sem mexer no site. A publicação troca a release pública de uma só vez.</p></div><Link className="button button-secondary" href={`/admin/${slug}`}>Voltar ao painel</Link></div>
        {rascunho && <p className="form-success">Rascunho salvo. Ele ainda não está visível no site.</p>}
        {publicado && <p className="form-success">Nova release publicada. A home pública foi atualizada.</p>}
        {(enquete || aviso) && <p className="form-success">O rascunho foi salvo. Ele ficará público após publicar uma nova release.</p>}
        {erro && <p className="form-error">{erro}</p>}
        <section className="panel form-panel"><header><div><span className="eyebrow dark">NOVA HISTÓRIA</span><h2>Rascunho de notícia</h2></div></header>
          <form action={createNewsDraftAction} className="form-grid content-form">
            <input type="hidden" name="slug" value={slug} />
            <label className="form-grid-wide">Título<input name="title" minLength={3} maxLength={150} required /></label>
            <label className="form-grid-wide">Resumo<input name="summary" maxLength={500} /></label>
            <label className="form-grid-wide">Texto<textarea name="body" rows={7} maxLength={10000} required /></label>
            <div className="form-actions"><button className="button button-secondary" type="submit">Salvar rascunho</button></div>
          </form>
        </section>
        <section className="panel form-panel"><header><div><span className="eyebrow dark">PARTICIPAÇÃO</span><h2>Nova enquete</h2><p>Voto único e imutável por membro aprovado. O resultado aparece depois do voto.</p></div></header>
          <form action={createPollDraftAction} className="form-grid content-form"><input type="hidden" name="slug" value={slug} /><label className="form-grid-wide">Pergunta<input name="title" minLength={3} maxLength={150} required /></label><label className="form-grid-wide">Contexto (opcional)<input name="summary" maxLength={500} /></label><label>Abre em<input type="datetime-local" name="opensAt" required /></label><label>Encerra em<input type="datetime-local" name="closesAt" required /></label>{Array.from({ length: 4 }, (_, index) => <label key={index}>Opção {index + 1}<input name="option" maxLength={120} required={index < 2} /></label>)}<div className="form-actions"><button className="button button-secondary">Salvar enquete</button></div></form>
        </section>
        <section className="panel form-panel"><header><div><span className="eyebrow dark">COMUNICAÇÃO</span><h2>Novo aviso</h2><p>O aviso fica marcado como “aconteceu” depois do horário, até a data de expiração.</p></div></header>
          <form action={createNoticeDraftAction} className="form-grid content-form"><input type="hidden" name="slug" value={slug} /><label className="form-grid-wide">Título<input name="title" minLength={3} maxLength={150} required /></label><label className="form-grid-wide">Descrição<input name="summary" maxLength={1000} /></label><label>Data e horário<input type="datetime-local" name="occursAt" required /></label><label>Expira em (opcional)<input type="datetime-local" name="expiresAt" /></label><label className="form-grid-wide">Link de destino (opcional)<input name="targetUrl" maxLength={500} placeholder="/agenda ou https://…" /></label><div className="form-actions"><button className="button button-secondary">Salvar aviso</button><small>Aviso editorial é exibido somente no site; não envia e-mail.</small></div></form>
        </section>
        <section className="panel people-panel"><header><div><span className="eyebrow dark">FILA EDITORIAL</span><h2>Conteúdos desta instância</h2></div><form action={publishContentReleaseAction}><input type="hidden" name="slug" value={slug} /><button className="button button-primary" type="submit">Publicar release</button></form></header>
          <div className="people-list">{content.map((item) => <article key={item.id}><div><b>{item.title}</b><small>{item.contentType} · {item.editorialStatus === "DRAFT" ? "Rascunho" : "Publicado"} · versão {item.version}</small></div><span className={item.editorialStatus === "DRAFT" ? "status-pill" : "release-live"}>{item.editorialStatus === "DRAFT" ? "NÃO PUBLICADO" : "PUBLICADO"}</span></article>)}{!content.length && <p>Nenhuma história criada ainda.</p>}</div>
        </section>
      </main>
    </AdminShell>
  );
}
