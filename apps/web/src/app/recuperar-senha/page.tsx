import Link from "next/link";
import { requestPasswordResetAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RequestPasswordResetPage({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const { enviado } = await searchParams;
  return <main className="auth-screen"><section className="auth-card">
    <span className="eyebrow dark">RECUPERAR ACESSO</span>
    <h1>Redefina sua senha.</h1>
    {enviado ? <p>Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Verifique sua caixa de entrada.</p> : <>
      <p>Informe o e-mail da conta. Se ele estiver cadastrado, enviaremos um link válido por 30 minutos.</p>
      <form action={requestPasswordResetAction} className="form-stack">
        <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <button className="button button-primary" type="submit">Enviar link de redefinição</button>
      </form>
    </>}
    <Link href="/acesso">Voltar ao acesso</Link>
  </section></main>;
}
