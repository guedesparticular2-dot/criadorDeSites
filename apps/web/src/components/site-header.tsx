import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { FootballIcon } from "./football-icon";

export function SiteHeader({ clubName = "Baixada" }: { clubName?: string }) {
  return (
    <header className="site-header">
      <div className="container header-grid">
        <Link href="/" className="brand-link"><BrandMark name={clubName} /></Link>
        <nav aria-label="Navegação principal" className="desktop-nav">
          <Link href="/#noticias">Notícias</Link>
          <Link href="/#agenda">Agenda</Link>
          <Link href="/#clube">O clube</Link>
        </nav>
        <Link href="/acesso" className="member-link">Área de membros <FootballIcon className="football-icon--nav" /></Link>
      </div>
    </header>
  );
}
