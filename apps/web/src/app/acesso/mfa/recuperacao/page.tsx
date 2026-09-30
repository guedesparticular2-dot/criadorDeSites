import { getRecoveryCodeDisclosure } from "../../../../lib/auth";
import { finishMfaEnrollmentAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MfaRecoveryCodesPage() {
  const recoveryCodes = await getRecoveryCodeDisclosure();
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow dark">CÓDIGOS DE RECUPERAÇÃO</span>
        <h1>Guarde estes códigos agora.</h1>
        <p>Cada código funciona uma única vez caso você perca acesso ao autenticador. Eles não serão exibidos novamente.</p>
        <ol className="recovery-codes">
          {recoveryCodes.map((code) => <li key={code}><code>{code}</code></li>)}
        </ol>
        <form action={finishMfaEnrollmentAction} className="form-stack">
          <button className="button button-primary" type="submit">Guardei os códigos e quero continuar</button>
        </form>
      </section>
    </main>
  );
}
