import Link from "next/link";
import { AdminShell } from "../../../components/admin-shell";
import { requireSuperuser } from "../../../lib/auth";
import { listDomainTenantOptions, listPlatformDomains } from "../../../lib/platform-domains";
import { DomainManager } from "./domain-manager";

export const dynamic = "force-dynamic";

export default async function PlatformDomainsPage() {
  const user = await requireSuperuser();
  const [domains, tenants] = await Promise.all([listPlatformDomains(user.id), listDomainTenantOptions(user.id)]);
  return <AdminShell platform userName={user.displayName}><main className="admin-content">
    <div className="admin-title"><div><span className="eyebrow dark">OPERAÇÃO DA PLATAFORMA</span><h1>Domínios personalizados.</h1><p>Prova de posse por DNS ou arquivo HTTP e ativação canônica somente após validação HTTPS.</p></div><div className="admin-title-actions"><Link className="button button-secondary" href="/platform">Instâncias</Link><Link className="button button-secondary" href="/platform/finance">Financeiro</Link></div></div>
    <DomainManager domains={domains} tenants={tenants} />
  </main></AdminShell>;
}
