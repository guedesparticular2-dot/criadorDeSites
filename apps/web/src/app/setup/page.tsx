import Link from "next/link";
import { redirect } from "next/navigation";
import { platformIsConfigured } from "../../lib/platform";
import { setupPlatformAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await platformIsConfigured()) redirect("/acesso");
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow dark">CONFIGURAÇÃO INICIAL</span>
        <h1>Prepare a plataforma.</h1>
        <p>Crie o primeiro Superusuário. Ele poderá provisionar clubes e nomear os respectivos Administradores Principais.</p>
        <form action={setupPlatformAction} className="form-stack">
          <label>Seu nome<input name="displayName" minLength={3} required autoComplete="name" /></label>
          <label>E-mail de acesso<input name="email" type="email" required autoComplete="email" /></label>
          <label>Senha inicial<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label>
          <small>No primeiro acesso, o Superusuário configurará o aplicativo autenticador antes de entrar na plataforma.</small>
          <button className="button button-primary" type="submit">Criar Superusuário</button>
        </form>
        <Link href="/">Voltar ao site</Link>
      </section>
    </main>
  );
}
