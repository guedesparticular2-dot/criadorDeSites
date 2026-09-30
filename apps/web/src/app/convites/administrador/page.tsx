import Link from "next/link";
import { inspectAdminInvitation } from "../../../lib/people";
import { acceptAdminInvitationAction } from "../../admin/[slug]/pessoas/actions";

export const dynamic = "force-dynamic";

export default async function AdminInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string; erro?: string }> }) {
  const { token = "", erro } = await searchParams;
  const invitation = await inspectAdminInvitation(token);
  return <main className="auth-screen"><section className="auth-card auth-card--wide">
    <span className="eyebrow dark">CONVITE ADMINISTRATIVO</span>
    <h1>{invitation ? `Administre ${invitation.tenantName}.` : "Convite indisponível."}</h1>
    {invitation ? <>
      <p>Este convite para <b>{invitation.email}</b> expira em sete dias. O acesso administrativo exige autenticação em duas etapas. Se você já possui uma conta na plataforma, informe a senha atual; os dados de perfil abaixo não substituirão os existentes.</p>
      {erro && <p className="form-error">{erro}</p>}
      <form action={acceptAdminInvitationAction} className="form-grid">
        <input type="hidden" name="token" value={token} />
        <label>Nome completo<input name="displayName" minLength={3} autoComplete="name" required /></label>
        <label>Data de nascimento<input name="birthDate" type="date" required /></label>
        <label className="form-grid-wide">Senha da conta<input name="password" type="password" minLength={12} maxLength={256} autoComplete="current-password" required /></label>
        <div className="form-actions"><button className="button button-primary" type="submit">Aceitar convite</button></div>
      </form>
    </> : <p>O link pode ter expirado, ter sido revogado ou já ter sido utilizado. Peça ao Administrador Principal para enviar outro convite.</p>}
    <Link href="/acesso">Ir para o acesso</Link>
  </section></main>;
}
