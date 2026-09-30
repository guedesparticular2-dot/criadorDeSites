import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTenantFromHost } from "../../lib/tenant";
import { submitRegistrationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RegistrationPage({ searchParams }: { searchParams: Promise<{ enviado?: string; erro?: string }> }) {
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) notFound();
  const { enviado, erro } = await searchParams;
  return (
    <main className="auth-screen">
      <section className="auth-card auth-card--wide">
        <span className="eyebrow dark">ÁREA DE MEMBROS</span>
        <h1>Entre para o {tenant.displayName}.</h1>
        <p>Seu cadastro será analisado pelo clube. Para menores de idade, também pediremos a confirmação do responsável.</p>
        {enviado && <p className="form-success">Cadastro enviado. Você receberá a atualização após a análise do clube.</p>}
        {erro && <p className="form-error">{erro}</p>}
        {!enviado && <form action={submitRegistrationAction} className="form-grid">
          <label>Nome completo<input name="displayName" minLength={3} autoComplete="name" required /></label>
          <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>Senha<input name="password" type="password" minLength={12} autoComplete="new-password" required /></label>
          <label>Data de nascimento<input name="birthDate" type="date" required /></label>
          <label className="form-grid-wide">Vínculo com o clube<input name="relationshipText" placeholder="Ex.: responsável, atleta, familiar ou amigo" required /></label>
          <fieldset className="form-grid-wide guardian-fields"><legend>Se for menor de idade, informe o responsável</legend><label>Nome do responsável<input name="guardianName" /></label><label>E-mail do responsável<input name="guardianEmail" type="email" /></label></fieldset>
          <label className="terms-check form-grid-wide"><input name="acceptedTerms" type="checkbox" required />Li e aceito os termos de participação e privacidade.</label>
          <div className="form-actions"><button className="button button-primary" type="submit">Enviar cadastro</button></div>
        </form>}
        <Link href="/">Voltar ao site</Link>
      </section>
    </main>
  );
}
