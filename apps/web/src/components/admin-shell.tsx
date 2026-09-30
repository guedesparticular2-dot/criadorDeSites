import Link from "next/link";
import { BrandMark } from "./brand-mark";

const nav = ["Visão geral", "Conteúdo", "Páginas e menus", "Mídia", "Pessoas", "Configurações"];

export function AdminShell({ children, platform = false, tenantName = "Baixada FC", userName = "Administrador" }: { children: React.ReactNode; platform?: boolean; tenantName?: string; userName?: string }) {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link href="/" className="brand-link"><BrandMark /></Link>
        <div className="tenant-chip"><span>{platform ? "PLATAFORMA" : "INSTÂNCIA ATUAL"}</span><b>{platform ? "Operação SaaS" : tenantName}</b></div>
        <nav aria-label="Administração">
          {nav.map((label, index) => <a className={index === 0 ? "active" : ""} href="#" key={label}><span>{String(index + 1).padStart(2, "0")}</span>{label}</a>)}
        </nav>
        <div className="sidebar-user"><span>{userName.slice(0, 2).toUpperCase()}</span><div><b>{userName}</b><small>{platform ? "Superusuário" : "Administradora"}</small></div></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><div><span className="status-dot" /> Sistema operacional</div><nav><Link href={platform ? "/admin" : "/admin"}>{platform ? "Painel do tenant" : "Trocar instância"}</Link><button aria-label="Notificações">03</button></nav></header>
        {children}
      </div>
    </div>
  );
}
