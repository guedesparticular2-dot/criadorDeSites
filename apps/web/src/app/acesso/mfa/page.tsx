import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, requireMfaChallenge } from "../../../lib/auth";
import { confirmMfaAuthenticationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  await requireMfaChallenge("AUTHENTICATE");
  const { erro } = await searchParams;
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow dark">VERIFICAÇÃO EM DUAS ETAPAS</span>
        <h1>Confirme seu acesso.</h1>
        <p>Digite o código de seis dígitos do seu aplicativo autenticador ou use um código de recuperação guardado por você.</p>
        {erro && <p className="form-error">{erro}</p>}
        <form action={confirmMfaAuthenticationAction} className="form-stack">
          <label>Código de autenticação<input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required /></label>
          <button className="button button-primary" type="submit">Confirmar acesso</button>
        </form>
        <Link href="/acesso">Usar outra conta</Link>
      </section>
    </main>
  );
}
