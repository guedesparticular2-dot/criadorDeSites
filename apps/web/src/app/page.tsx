import Link from "next/link";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "../components/site-header";
import { FootballIcon } from "../components/football-icon";
import { BrandMark } from "../components/brand-mark";
import { NotificationCenter } from "../components/notification-center";
import { PollCard } from "../components/poll-card";
import { PublicNotice } from "../components/public-notice";
import { getCurrentUser } from "../lib/auth";
import { isApprovedTenantMember, listPublishedNotices, listPublishedPolls, listUnreadMemberNotifications } from "../lib/community";
import { getPublishedContent } from "../lib/content";
import { getTenantFromHost } from "../lib/tenant";

const news = [
  { tag: "FORMAÇÃO", date: "24 SET", title: "Muito além do placar: um lugar para crescer junto", tone: "navy", image: "/news-treino.png", alt: "Crianças treinam futsal em uma quadra iluminada" },
  { tag: "COMUNIDADE", date: "22 SET", title: "Famílias participam do encontro de abertura da temporada", tone: "sand", image: "/news-comunidade.png", alt: "Famílias e crianças conversam juntas dentro de um ginásio" },
  { tag: "BASTIDORES", date: "18 SET", title: "Comissão apresenta a rotina das novas categorias", tone: "wine", image: "/news-bastidores.png", alt: "Crianças se reúnem ao redor de uma prancheta antes do jogo" },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let tenant = null;
  let tenantLookupFailed = false;
  try {
    tenant = await getTenantFromHost((await headers()).get("host") ?? "localhost");
  } catch {
    tenantLookupFailed = true;
  }
  if (!tenant && !tenantLookupFailed) notFound();
  const clubName = tenant?.displayName ?? "Baixada";
  const clubFullName = tenant?.displayName ?? "Baixada Futsal Club";
  const clubShortName = tenant?.displayName.toUpperCase() ?? "BAIXADA FC";
  const signedInUser = tenant ? await getCurrentUser() : null;
  const canParticipate = tenant && signedInUser ? await isApprovedTenantMember(tenant.id, signedInUser.id) : false;
  const memberNotifications = tenant && signedInUser ? await listUnreadMemberNotifications(tenant.id, signedInUser.id) : [];
  const [publishedPolls, publishedNotices] = tenant ? await Promise.all([listPublishedPolls(tenant.id, signedInUser?.id).catch(() => []), listPublishedNotices(tenant.id).catch(() => [])]) : [[], []];
  const publishedNews = tenant ? await getPublishedContent(tenant.id, "NEWS").catch(() => []) : [];
  const visibleNews = publishedNews.length ? publishedNews.slice(0, 3).map((item, index) => ({ tag: "HISTÓRIAS DO CLUBE", date: item.publishedAt ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(item.publishedAt).toUpperCase() : "BAIXADA", title: item.title, tone: news[index % news.length]!.tone, image: news[index % news.length]!.image, alt: item.summary ?? "História da comunidade do clube", href: `/historias/${item.slug}` })) : news.map((item) => ({ ...item, href: "#" }));
  const themeStyle = {
    ...(tenant?.themeOverrides["color.brand.blue"] ? { "--match-blue": tenant.themeOverrides["color.brand.blue"] } : {}),
    ...(tenant?.themeOverrides["color.brand.green"] ? { "--forest-900": tenant.themeOverrides["color.brand.green"] } : {}),
  } as CSSProperties;
  return (
    <main style={themeStyle}>
      <SiteHeader clubName={clubName} />
      <NotificationCenter initialNotifications={memberNotifications.map((notification) => ({ ...notification, createdAt: notification.createdAt.toISOString() }))} />
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-backdrop" role="img" aria-label="Jogadores mirins disputam uma partida de futsal em uma quadra lotada" />
        <div className="hero-mask" aria-hidden="true" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="hero-welcome" aria-label={`Bem-vindo ao ${clubFullName}`}>
              <span>Bem-vindo</span>
              <strong>ao {clubFullName}</strong>
            </div>
            <p className="hero-note">NOSSA CASA · NOSSA HISTÓRIA</p>
            <h1 id="hero-title">O jogo começa<br />muito antes<br /><em>da quadra.</em></h1>
            <p className="hero-description">Formação esportiva, vínculos fortes e histórias que merecem ser lembradas.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="#noticias">Conheça o Baixada <FootballIcon className="football-icon--arrow" /></Link>
              <Link className="hero-link" href="#clube">Nossa história <FootballIcon className="football-icon--arrow" /></Link>
            </div>
          </div>
          <div className="hero-signature" aria-hidden="true">
            <span>{clubShortName}</span>
            <span>FUTSAL · FORMAÇÃO · COMUNIDADE</span>
          </div>
        </div>
      </section>

      <section className="score-strip" aria-label="Próximo jogo">
        <img className="score-watermark" src="/playbook-watermark.png" alt="" aria-hidden="true" />
        <div className="container score-grid">
          <div><small>PRÓXIMO JOGO</small><strong>28 SET · 10H</strong></div>
          <Link className="matchup" href="/jogos/proximo" aria-label={`Ver detalhes do próximo jogo: ${clubFullName} contra Raio FC`}><span className="mini-shield mini-shield-logo"><img src="/logo-baixada-fc.png" alt="" aria-hidden="true" /></span><b>{clubShortName}</b><i>×</i><b>RAIO FC</b><span className="mini-shield mini-shield-logo opponent opponent-logo"><img src="/logo-raio-fc.png" alt="" aria-hidden="true" /></span></Link>
          <div className="match-place"><small>CAMPEONATO MUNICIPAL</small><strong>COUNTRY CLUB</strong><span className="match-location">BELFORD ROXO</span></div>
        </div>
      </section>

      {publishedNotices.length > 0 && <section className="notice-strip container" aria-label="Avisos da comunidade">{publishedNotices.map((notice) => <PublicNotice key={notice.id} notice={{ ...notice, occursAt: notice.occursAt.toISOString() }} />)}</section>}

      <section id="noticias" className="section container">
        <div className="section-heading">
          <div><span className="eyebrow dark">ISSO AQUI É BAIXADA</span><h2>Últimas histórias</h2></div>
          <Link href="#">Ver todas <FootballIcon className="football-icon--inline" /></Link>
        </div>
        <div className="news-grid">
          {visibleNews.map((item) => (
            <Link className={`news-card news-${item.tone}`} href={item.href} key={item.title}>
              <div className="news-visual"><img src={item.image} alt={item.alt} /></div>
              <div className="news-meta"><span>{item.tag}</span><time>{item.date}</time></div>
              <h3>{item.title}</h3>
              <span className="news-card-action">Ler história <FootballIcon className="football-icon--inline" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section id="agenda" className="agenda-section">
        <div className="container agenda-grid">
          <div><span className="eyebrow">AGENDA</span><h2>Os próximos<br />encontros.</h2><p>Jogos, treinos e momentos para viver o clube de perto.</p></div>
          <ol className="agenda-list">
            <li><time><b>28</b>SET</time><div><small>JOGO · SUB-11</small><strong>Baixada FC × Raio FC</strong><span>10h · Country Club · Belford Roxo</span></div><FootballIcon className="football-icon--agenda" /></li>
            <li><time><b>02</b>OUT</time><div><small>TREINO ABERTO</small><strong>Encontro com as famílias</strong><span>18h30 · Quadra do clube</span></div><FootballIcon className="football-icon--agenda" /></li>
            <li><time><b>05</b>OUT</time><div><small>JOGO · SUB-13</small><strong>Estrela do Sul × Baixada FC</strong><span>09h · Arena Municipal</span></div><FootballIcon className="football-icon--agenda" /></li>
          </ol>
        </div>
      </section>

      {publishedPolls.length > 0 && <section className="poll-section container" aria-labelledby="poll-section-title"><div className="poll-section-heading"><span className="eyebrow dark">VOZ DA COMUNIDADE</span><h2 id="poll-section-title">A gente decide junto.</h2></div><div className="poll-grid">{publishedPolls.map((poll) => <PollCard key={poll.id} poll={{ ...poll, opensAt: poll.opensAt.toISOString(), closesAt: poll.closesAt.toISOString() }} canParticipate={canParticipate} />)}</div></section>}

      <section id="clube" className="manifesto">
        <div className="container">
          <h2 className="manifesto-title">Isso aqui é O Baixada</h2>
          <div className="manifesto-grid">
            <div className="manifesto-media">
              <video autoPlay muted loop playsInline preload="metadata" aria-label="Jogador do Baixada fazendo embaixadinhas">
                <source src="/embaixadinha-sem-capa.mp4" type="video/mp4" />
              </video>
            </div>
            <div className="manifesto-copy">
              <span className="eyebrow dark">A HISTÓRIA DO BAIXADA</span>
              <h2>Uma brincadeira que virou realidade.</h2>
              <p>O Baixada Futsal Clube nasceu de uma iniciativa dos estudantes Heitor Guedes, Miguel Henrique e Enzo Gabriel, do 4º ano do Colégio Santo Antônio da Prata, em Nova Iguaçu. Alunos da professora Gisele e da professora de Educação Física Monique, eles imaginaram um time para se divertir e criar atividades em grupo.</p>
              <p>Em quadra, o grande rival é o Raio FC, clube liderado e idealizado pelo aluno Benjamin. Fora da disputa, os dois times fazem parte da mesma história: uma oportunidade de reunir amigos, aproximar as famílias e construir uma comunidade com alegria, esporte e bons momentos juntos.</p>
            </div>
          </div>
        </div>
      </section>
      <footer className="site-footer">
        <div className="container">
          <div className="site-footer-main">
            <div className="site-footer-brand">
              <Link href="/" aria-label={clubFullName}><BrandMark name={clubName} /></Link>
              <p>Futsal, formação e comunidade.</p>
            </div>
            <nav className="site-footer-nav" aria-label="Navegação do rodapé">
              <Link href="#noticias">Notícias</Link>
              <Link href="#agenda">Agenda</Link>
              <Link href="#clube">O clube</Link>
            </nav>
          </div>
          <div className="site-footer-bottom"><small>© 2026 {clubFullName}</small></div>
        </div>
      </footer>
    </main>
  );
}
