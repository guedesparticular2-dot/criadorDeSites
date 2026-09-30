"use client";

import { useState } from "react";
import Link from "next/link";

type CommentItem = { id: string; authorName: string; body: string; createdAt: string; canDelete: boolean };

export function CommunityComments({ contentId, initialComments, canParticipate }: { contentId: string; initialComments: CommentItem[]; canParticipate: boolean }) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshComments() {
    const response = await fetch(`/api/v1/content/${contentId}/comments`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as { comments: CommentItem[] };
      setComments(data.comments);
    }
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/content/${contentId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível publicar.");
      setBody(""); await refreshComments();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível publicar."); }
    finally { setBusy(false); }
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("Excluir seu comentário? Essa ação não pode ser desfeita.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/comments/${commentId}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível excluir.");
      setComments((items) => items.filter((item) => item.id !== commentId));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível excluir."); }
    finally { setBusy(false); }
  }

  async function reportComment(event: React.FormEvent<HTMLFormElement>, commentId: string) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/comments/${commentId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar a denúncia.");
      setReporting(null); setReason(""); setMessage("Denúncia registrada. O comentário permanece visível enquanto a equipe analisa.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível registrar a denúncia."); }
    finally { setBusy(false); }
  }

  return <section className="community-comments" aria-labelledby="comments-title">
    <header><span className="eyebrow dark">CONVERSA DA COMUNIDADE</span><h2 id="comments-title">Comentários <span>({comments.length})</span></h2><p>Os comentários aparecem na hora. A moderação acontece depois, com participação da comunidade.</p></header>
    {message && <p className="community-message" role="status">{message}</p>}
    {canParticipate ? <form className="community-comment-form" onSubmit={submitComment}><label htmlFor="comment-body">Escreva seu comentário</label><textarea id="comment-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={4} required /><small>{body.length}/2.000 caracteres · comentários não podem ser editados depois da publicação.</small><button className="button button-primary" disabled={busy}>Publicar comentário</button></form> : <p className="community-sign-in">Para participar, é preciso entrar com uma conta aprovada deste clube. <Link href="/acesso">Acesse sua conta</Link> ou <Link href="/cadastro">cadastre-se</Link>.</p>}
    <ol className="community-comment-list">{comments.map((comment) => <li key={comment.id}><article><header><b>{comment.authorName}</b><time dateTime={comment.createdAt}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.createdAt))}</time></header><p>{comment.body}</p><footer>{comment.canDelete && <button type="button" onClick={() => deleteComment(comment.id)} disabled={busy}>Excluir meu comentário</button>}{canParticipate && !comment.canDelete && <button type="button" onClick={() => { setReporting(reporting === comment.id ? null : comment.id); setReason(""); }}>Denunciar</button>}</footer>{reporting === comment.id && <form className="community-report-form" onSubmit={(event) => reportComment(event, comment.id)}><label>Por que este comentário deve ser analisado?<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={3} required /></label><small>A equipe recebe a denúncia; o comentário não é ocultado automaticamente.</small><button className="button button-secondary" disabled={busy}>Enviar denúncia</button></form>}</article></li>)}{!comments.length && <li className="community-empty">Ainda não há comentários. Seja a primeira pessoa a participar.</li>}</ol>
  </section>;
}
