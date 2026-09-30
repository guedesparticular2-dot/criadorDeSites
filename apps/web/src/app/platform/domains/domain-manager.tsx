"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PlatformDomain } from "../../../lib/platform-domains";

type TenantOption = { id: string; displayName: string; slug: string };
type Challenge = { domainId: string; hostname: string; method: string; token: string; proofName: string };

export function DomainManager({ domains, tenants }: { domains: PlatformDomain[]; tenants: TenantOption[] }) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState("");

  async function post(url: string, body?: Record<string, string>) {
    const response = await fetch(url, {
      method: "POST",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "A operação não foi concluída.");
    return result;
  }

  async function createChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setChallenge(null);
    setBusyId("new");
    try {
      const form = new FormData(event.currentTarget);
      const result = await post("/api/platform/domains/challenges", {
        tenantId: String(form.get("tenantId") ?? ""),
        hostname: String(form.get("hostname") ?? ""),
        method: String(form.get("method") ?? "DNS_TXT"),
      }) as Challenge;
      setChallenge(result);
      setFeedback("Desafio criado. Copie o valor agora; ele não será armazenado em texto claro nem exibido novamente.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível criar o desafio.");
    } finally { setBusyId(""); }
  }

  async function verify(domainId: string) {
    setFeedback("");
    setBusyId(domainId);
    try {
      await post(`/api/platform/domains/${domainId}/verify`);
      setFeedback("Domínio verificado. Antes de ativá-lo, configure TLS no proxy e confirme que o HTTPS responde corretamente.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "A verificação não foi concluída.");
    } finally { setBusyId(""); }
  }

  async function activate(event: FormEvent<HTMLFormElement>, domainId: string) {
    event.preventDefault();
    setFeedback("");
    setBusyId(domainId);
    try {
      const form = new FormData(event.currentTarget);
      await post(`/api/platform/domains/${domainId}/activate`, { reason: String(form.get("reason") ?? "") });
      setFeedback("Domínio canônico ativado após validação HTTPS.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível ativar o domínio.");
    } finally { setBusyId(""); }
  }

  return <>
    {feedback && <p className={challenge ? "form-success" : "form-error"} role="status">{feedback}</p>}
    {challenge && <section className="panel domain-proof"><span className="eyebrow dark">PROVA DE POSSE · MOSTRADA UMA ÚNICA VEZ</span><h2>{challenge.hostname}</h2>
      {challenge.method === "DNS_TXT" ? <><p>Crie um registro TXT com estes dados:</p><dl><div><dt>Nome / host</dt><dd><code>{challenge.proofName}</code></dd></div><div><dt>Valor</dt><dd><code>{challenge.token}</code></dd></div></dl></> : <><p>Publique um arquivo de texto com o token abaixo neste endereço:</p><dl><div><dt>URL</dt><dd><code>{challenge.proofName}</code></dd></div><div><dt>Conteúdo exato</dt><dd><code>{challenge.token}</code></dd></div></dl></>}
      <button className="button button-primary" type="button" onClick={() => setChallenge(null)}>Copiei o valor</button>
    </section>}

    <section className="panel form-panel"><header><div><span className="eyebrow dark">NOVO DOMÍNIO</span><h2>Vincular hostname</h2></div></header>
      <p className="platform-finance-note">Depois da prova de posse, o hostname também precisa ser incluído em <code>APP_DOMAINS</code> no proxy Caddy e responder por HTTPS válido antes da ativação canônica. O painel não altera DNS, proxy ou certificados.</p>
      <form onSubmit={createChallenge} className="form-grid">
        <label>Instância<select name="tenantId" required defaultValue=""><option value="" disabled>Selecione o tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.displayName} · {tenant.slug}</option>)}</select></label>
        <label>Domínio<input name="hostname" placeholder="www.clube.com.br" autoCapitalize="none" autoCorrect="off" required /></label>
        <label>Método de verificação<select name="method" defaultValue="DNS_TXT"><option value="DNS_TXT">Registro DNS TXT</option><option value="HTTP_FILE">Arquivo HTTP</option></select></label>
        <div className="form-actions"><button className="button button-primary" disabled={busyId === "new"}>{busyId === "new" ? "Criando…" : "Gerar desafio de 24 h"}</button><small>O domínio não substitui o canônico até provar posse e responder por HTTPS válido.</small></div>
      </form>
    </section>

    <section className="panel tenant-table"><header><div><span className="eyebrow dark">DOMÍNIOS CADASTRADOS</span><h2>Hostnames por instância</h2></div></header>
      <div className="people-list">{domains.map((domain) => <article key={domain.id}>
        <div><b>{domain.hostname} {domain.isCanonical && <span className="release-live">CANÔNICO</span>}</b><small>{domain.tenantName} · {domain.tenantSlug} · posse: {domain.verificationStatus} · TLS: {domain.tlsStatus}</small></div>
        <div className="domain-actions">
          {domain.challengeId ? <><small>Desafio {domain.challengeMethod} expira em {domain.challengeExpiresAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(domain.challengeExpiresAt) : "24 h"}. Se o token original não estiver mais visível, gere outro.</small><button className="button button-secondary" disabled={busyId === domain.id} onClick={() => void verify(domain.id)}>{busyId === domain.id ? "Verificando…" : "Verificar prova"}</button></> : domain.verificationStatus === "PENDING" || domain.verificationStatus === "FAILED" ? <small>Sem desafio ativo. Gere um novo para exibir o token.</small> : null}
          {!domain.isCanonical && domain.verificationStatus === "VERIFIED" && <form className="domain-activate-form" onSubmit={(event) => void activate(event, domain.id)}><label>Motivo de ativação<input name="reason" minLength={8} placeholder="Ex.: DNS e TLS configurados" required /></label><button className="button button-primary" disabled={busyId === domain.id}>{busyId === domain.id ? "Validando HTTPS…" : "Ativar como canônico"}</button></form>}
        </div>
      </article>)}{!domains.length && <p>Nenhum domínio cadastrado.</p>}</div>
    </section>
  </>;
}
