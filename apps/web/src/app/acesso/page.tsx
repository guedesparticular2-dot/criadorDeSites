import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { platformIsConfigured } from "../../lib/platform";
import { signInAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ erro?: string; configurada?: string; "senha-redefinida"?: string; convite?: string }> }) {
  if (!await platformIsConfigured()) redirect("/setup");
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(currentUser.isSuperuser ? "/platform" : currentUser.isAdministrative ? "/admin" : "/");
  const { erro, configurada, "senha-redefinida": senhaRedefinida, convite } = await searchParams;
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow dark">ÁREA DE MEMBROS</span>
        <h1>Acesse sua conta.</h1>
        <p>Membros aprovados podem entrar para participar da comunidade. Administradores usam MFA para acessar a gestão.</p>
        {configurada && <p className="form-success">Conta criada. Configure o autenticador no seu primeiro acesso.</p>}
        {senhaRedefinida && <p className="form-success">Senha atualizada. Entre novamente com a nova senha.</p>}
        {convite && <p className="form-success">Convite aceito. Entre com sua conta; por ser administrador, configure a autenticação em duas etapas antes de acessar o painel.</p>}
        {erro && <p className="form-error">{erro === "mfa-expirado" ? "A verificação expirou. Entre novamente." : "Não foi possível entrar. Confira e-mail e senha."}</p>}
        <form action={signInAction} className="form-stack">
          <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
          <label>Senha<input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="button button-primary" type="submit">Entrar</button>
        </form>
        <Link href="/recuperar-senha">Esqueci minha senha</Link>
        <Link href="/cadastro">Ainda não é membro? Cadastre-se neste clube.</Link>
        <Link href="/">Voltar ao site</Link>
      </section>
    </main>
  );
}
