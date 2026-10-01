import Link from "next/link";
import { BrandMark } from "./brand-mark";

type PlatformSection = "overview" | "finance" | "domains" | "support";
type TenantSection = "overview" | "content" | "media" | "moderation" | "people" | "appearance";

const platformNavigation: { id: PlatformSection; label: string; href: string }[] = [
  { id: "overview", label: "Instâncias", href: "/platform" },
  { id: "finance", label: "Financeiro e operação", href: "/platform/finance" },
  { id: "domains", label: "Domínios", href: "/platform/domains" },
  { id: "support", label: "Suporte técnico", href: "/platform/suporte" },
];

const tenantNavigation: { id: TenantSection; label: string; href: (slug: string) => string }[] = [
  { id: "overview", label: "Visão geral", href: (slug) => `/admin/${slug}` },
  { id: "content", label: "Conteúdo", href: (slug) => `/admin/${slug}/conteudo` },
  { id: "media", label: "Mídia", href: (slug) => `/admin/${slug}/midia` },
  { id: "moderation", label: "Moderação", href: (slug) => `/admin/${slug}/moderacao` },
  { id: "people", label: "Pessoas", href: (slug) => `/admin/${slug}/pessoas` },
  { id: "appearance", label: "Aparência", href: (slug) => `/admin/${slug}#aparencia` },
];

export function AdminShell({
  children,
  platform = false,
  tenantName = "Baixada Futsal Clube",
  tenantSlug,
  userName = "Administrador",
  isSuperuser = false,
  activeSection = "overview",
}: {
  children: React.ReactNode;
  platform?: boolean;
  tenantName?: string;
  tenantSlug?: string;
  userName?: string;
  isSuperuser?: boolean;
  activeSection?: PlatformSection | TenantSection;
}) {
  const navigation = platform
    ? platformNavigation
    : tenantSlug
      ? tenantNavigation.map((item) => ({ ...item, href: item.href(tenantSlug) }))
      : [];
  const homeHref = platform ? "/platform" : tenantSlug ? `/admin/${tenantSlug}` : "/";
  const returnHref = platform || isSuperuser ? "/platform" : "/admin";
  const returnLabel = platform || isSuperuser ? "Visão geral da plataforma" : "Trocar instância";

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href={homeHref} className="brand-link" aria-label={platform ? "Início da plataforma" : `Painel ${tenantName}`}><BrandMark /></Link>
        <div className="tenant-chip"><span>{platform ? "PLATAFORMA" : "INSTÂNCIA ATUAL"}</span><b>{platform ? "Operação SaaS" : tenantName}</b></div>
        <nav aria-label={platform ? "Navegação da plataforma" : "Administração do clube"}>
          {navigation.map((item, index) => <Link
            className={item.id === activeSection ? "active" : ""}
            aria-current={item.id === activeSection ? "page" : undefined}
            href={item.href}
            key={item.id}
          ><span>{String(index + 1).padStart(2, "0")}</span>{item.label}</Link>)}
        </nav>
        <div className="sidebar-user"><span>{userName.slice(0, 2).toUpperCase()}</span><div><b>{userName}</b><small>{platform || isSuperuser ? "Superusuário" : "Administrador"}</small></div></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><div><span className="status-dot" /> Sistema operacional</div><nav><Link href={returnHref}>{returnLabel}</Link></nav></header>
        {children}
      </div>
    </div>
  );
}
