import Link from "next/link";
import { SiteHeader } from "../../../components/site-header";
import { FootballIcon } from "../../../components/football-icon";

export default function NextMatchPage() {
  return (
    <main className="match-detail-page">
      <SiteHeader />
      <section className="match-detail" aria-labelledby="match-detail-title">
        <div className="container">
          <Link className="match-detail-back" href="/"><FootballIcon className="football-icon--inline" /> Voltar para o início</Link>
          <span className="eyebrow dark">PRÓXIMO JOGO · 28 SET · 10H</span>
          <h1 id="match-detail-title">Baixada FC <em>×</em> Raio FC</h1>
          <div className="match-detail-card">
            <div className="match-detail-teams">
              <div><img src="/logo-baixada-fc.png" alt="Escudo do Baixada FC" /><strong>BAIXADA FC</strong></div>
              <span>×</span>
              <div><img src="/logo-raio-fc.png" alt="Escudo do Raio FC" /><strong>RAIO FC</strong></div>
            </div>
            <div className="match-detail-meta">
              <div><small>CAMPEONATO</small><strong>CAMPEONATO MUNICIPAL</strong></div>
              <div><small>LOCAL</small><strong>COUNTRY CLUB · BELFORD ROXO</strong></div>
            </div>
          </div>
        </div>
      </section>
      <footer className="site-footer"><div className="container"><div className="site-footer-bottom"><small>© 2026 Baixada Futsal Clube</small></div></div></footer>
    </main>
  );
}
