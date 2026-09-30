import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "../../../../components/admin-shell";
import { requireCurrentUser } from "../../../../lib/auth";
import { listTenantMedia } from "../../../../lib/media";
import { requireTenantPermission } from "../../../../lib/tenant";
import { uploadMediaAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function MediaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ enviado?: string; erro?: string }> }) {
  const user = await requireCurrentUser();
  const { slug } = await params;
  let tenant;
  try {
    tenant = await requireTenantPermission(slug, user, "media.upload");
  } catch {
    redirect(`/admin/${slug}?erro=acesso-negado`);
  }
  const media = await listTenantMedia(tenant.id, user.id);
  const { enviado, erro } = await searchParams;
  return (
    <AdminShell tenantName={tenant.displayName} userName={user.displayName} platform={user.isSuperuser}>
      <main className="admin-content">
        <div className="admin-title"><div><span className="eyebrow dark">MÍDIA</span><h1>Biblioteca segura.</h1><p>O original fica temporário até que todas as variantes obrigatórias sejam processadas.</p></div><Link className="button button-secondary" href={`/admin/${slug}`}>Voltar ao painel</Link></div>
        {enviado && <p className="form-success">Imagem recebida e encaminhada para a fila de processamento.</p>}
        {erro && <p className="form-error">{erro}</p>}
        <section className="panel form-panel"><header><div><span className="eyebrow dark">NOVA IMAGEM</span><h2>Enviar para processamento</h2></div></header>
          <form action={uploadMediaAction} className="form-grid" encType="multipart/form-data"><input type="hidden" name="slug" value={slug} /><label className="form-grid-wide">Arquivo<input type="file" name="media" accept="image/jpeg,image/png,image/webp,image/heic" required /></label><div className="form-actions"><small>JPEG, PNG, WebP ou HEIC · máximo de 25 MB · o original não será preservado depois do processamento correto.</small><button className="button button-primary" type="submit">Enviar imagem</button></div></form>
        </section>
        <section className="panel people-panel"><header><div><span className="eyebrow dark">FILA DE MÍDIA</span><h2>Arquivos desta instância</h2></div></header><div className="people-list">{media.map((asset) => <article key={asset.id}><div><b>{asset.originalFilename}</b><small>{asset.mimeType} · {(asset.byteSize / 1024 / 1024).toFixed(2)} MB · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(asset.createdAt)}</small></div><span className="status-pill">{asset.processingStatus}</span></article>)}{!media.length && <p>Nenhuma imagem enviada ainda.</p>}</div></section>
      </main>
    </AdminShell>
  );
}
