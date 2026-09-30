import { redirect } from "next/navigation";
import Link from "next/link";
import { requireCurrentUser } from "../../lib/auth";
import { listAdministrativeTenantContexts } from "../../lib/tenant";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireCurrentUser();
  if (user.isSuperuser) redirect("/platform");
  if (!user.isAdministrative) redirect("/");
  const contexts = await listAdministrativeTenantContexts(user);
  if (contexts.length === 1) redirect(`/admin/${contexts[0]!.slug}`);
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow dark">SELECIONE A INSTÂNCIA</span>
        <h1>Onde você quer administrar?</h1>
        <p>Seu acesso é separado por clube. Escolha a instância para definir o contexto administrativo desta sessão.</p>
        <nav className="tenant-context-list" aria-label="Instâncias administrativas">
          {contexts.map((context) => <Link key={context.slug} href={`/admin/${context.slug}`}><span>{context.roleCode === "PRIMARY_ADMIN" ? "ADMINISTRADOR PRINCIPAL" : "ADMINISTRADOR"}</span><b>{context.displayName}</b></Link>)}
          {!contexts.length && <p className="form-error">Sua conta não possui uma associação administrativa ativa.</p>}
        </nav>
        <Link href="/acesso">Usar outra conta</Link>
      </section>
    </main>
  );
}
