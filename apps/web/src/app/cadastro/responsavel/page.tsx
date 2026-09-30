import Link from "next/link";
import { confirmGuardian } from "../../../lib/registration";

export const dynamic = "force-dynamic";

export default async function GuardianConfirmationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  let result: "confirmed" | "already-confirmed" | null = null;
  let error: string | null = null;
  try {
    result = await confirmGuardian((await searchParams).token ?? "");
  } catch (reason) {
    error = reason instanceof Error ? reason.message : "Não foi possível confirmar o responsável.";
  }
  return <main className="auth-screen"><section className="auth-card"><span className="eyebrow dark">CONFIRMAÇÃO DO RESPONSÁVEL</span><h1>{result ? "Confirmação registrada." : "Não foi possível confirmar."}</h1><p>{result === "already-confirmed" ? "Este responsável já havia confirmado o cadastro." : result ? "A solicitação agora pode seguir para análise do clube." : error}</p><Link href="/">Voltar ao site</Link></section></main>;
}
