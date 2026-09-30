import Link from "next/link";
import { resetPasswordAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; erro?: string }> }) {
  const { token, erro } = await searchParams;
  return <main className="auth-screen"><section className="auth-card">
    <span className="eyebrow dark">RECUPERAR ACESSO</span>
    <h1>Escolha uma nova senha.</h1>
    <p>Use pelo menos 12 caracteres. Ao concluir, encerraremos as sessões atuais da conta.</p>
    {erro && <p className="form-error">{erro}</p>}
    {!token ? <p className="form-error">O link está incompleto. Solicite uma nova redefinição.</p> : <form action={resetPasswordAction} className="form-stack">
      <input type="hidden" name="token" value={token} />
      <label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></label>
      <button className="button button-primary" type="submit">Salvar nova senha</button>
    </form>}
    <Link href="/recuperar-senha">Solicitar outro link</Link>
  </section></main>;
}
