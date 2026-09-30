import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getMfaEnrollmentSecret } from "../../../../lib/auth";
import { confirmMfaEnrollmentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MfaEnrollmentPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const { secret } = await getMfaEnrollmentSecret();
  const { erro } = await searchParams;
  const issuer = "Baixada FC";
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow dark">SEGURANÇA DA CONTA</span>
        <h1>Configure seu autenticador.</h1>
        <p>Adicione esta chave no Google Authenticator, Microsoft Authenticator, 1Password ou aplicativo compatível. Depois, informe o código exibido.</p>
        <div className="mfa-secret"><span>CHAVE DE CONFIGURAÇÃO</span><code>{secret}</code><a href={uri}>Abrir no autenticador</a></div>
        {erro && <p className="form-error">{erro}</p>}
        <form action={confirmMfaEnrollmentAction} className="form-stack">
          <label>Código de seis dígitos<input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required /></label>
          <button className="button button-primary" type="submit">Ativar MFA</button>
        </form>
        <Link href="/acesso">Voltar ao acesso</Link>
      </section>
    </main>
  );
}
