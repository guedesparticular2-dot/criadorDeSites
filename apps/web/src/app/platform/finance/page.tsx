import Link from "next/link";
import { AdminShell } from "../../../components/admin-shell";
import { requireSuperuser } from "../../../lib/auth";
import { getPlatformOperations, listPaymentEvidence } from "../../../lib/platform-operations";
import { createManualChargeAction, registerManualPaymentAction, saveTenantContractAction, setCommercialSuspensionAction } from "./actions";

export const dynamic = "force-dynamic";

const money = (value: string | number | null | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
const bytes = (value: number | string) => {
  const amount = Number(value);
  if (amount < 1024) return `${amount} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let scaled = amount / 1024;
  let unit = units[0]!;
  for (let index = 1; scaled >= 1024 && index < units.length; index += 1) { scaled /= 1024; unit = units[index]!; }
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(scaled)} ${unit}`;
};
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const platformDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
};

export default async function PlatformFinancePage({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  const user = await requireSuperuser();
  const [data, receipts, params] = await Promise.all([getPlatformOperations(user.id), listPaymentEvidence(user.id), searchParams]);
  const metrics = data.metrics;
  const today = platformDate(new Date());
  const period = today.slice(0, 7);
  const tenantsWithContracts = data.tenants.filter((tenant) => tenant.planCode);
  const openCharges = data.charges.filter((charge) => Number(charge.outstandingAmount) > 0);

  return <AdminShell platform userName={user.displayName} activeSection="finance">
    <main className="admin-content">
      <div className="admin-title"><div><span className="eyebrow dark">OPERAÇÃO DA PLATAFORMA</span><h1>Financeiro e operação.</h1><p>Controle manual em BRL, contratos versionados e suspensão independente do status financeiro.</p></div><div className="admin-title-actions"><Link className="button button-secondary" href="/platform">Instâncias</Link><Link className="button button-secondary" href="/platform/suporte">Suporte</Link></div></div>
      {params.erro && <p className="form-error">{params.erro}</p>}
      {params.sucesso && <p className="form-success">{params.sucesso}</p>}

      <section className="metric-grid">
        <article className="metric-card"><span>Receita mensal contratada</span><strong>{money(metrics?.monthlyContracted)}</strong><small>Mensalizada: anual ÷ 12, trimestral ÷ 3</small></article>
        <article className="metric-card"><span>Previsto neste mês</span><strong>{money(metrics?.expectedThisMonth)}</strong><small>Referência {period}</small></article>
        <article className="metric-card"><span>Recebido neste mês</span><strong>{money(metrics?.receivedThisMonth)}</strong><small>Pagamentos confirmados</small></article>
        <article className="metric-card"><span>Inadimplência</span><strong>{Number(metrics?.delinquencyPercent ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</strong><small>Vencido ÷ total em aberto</small></article>
        <article className="metric-card"><span>Aberto vencido</span><strong>{money(metrics?.overdueOpen)}</strong><small>Saldo não alocado</small></article>
        <article className="metric-card"><span>Aberto a vencer</span><strong>{money(metrics?.upcomingOpen)}</strong><small>Saldo não alocado</small></article>
      </section>

      <section className="panel form-panel"><header><div><span className="eyebrow dark">COBRANÇA MANUAL</span><h2>Registrar cobrança</h2></div><small>Sem gateway; valores em BRL.</small></header>
        <form action={createManualChargeAction} className="form-grid">
          <label>Instância<select name="tenantId" required defaultValue=""><option value="" disabled>Selecione o tenant</option>{tenantsWithContracts.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.displayName} · {tenant.slug}</option>)}</select></label>
          <label>Período de referência<input name="referencePeriod" type="month" defaultValue={period} required /></label>
          <label>Vencimento<input name="dueDate" type="date" defaultValue={today} required /></label>
          <label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" placeholder="0,00" required /></label>
          <label className="form-grid-wide">Observação<input name="notes" maxLength={500} placeholder="Ex.: mensalidade do plano Médio" /></label>
          <div className="form-actions"><button className="button button-primary" type="submit">Registrar cobrança</button></div>
        </form>
      </section>

      <section className="panel tenant-table"><header><div><span className="eyebrow dark">CONTRATOS ATIVOS</span><h2>Plano e receita recorrente</h2></div></header>
        <div className="people-list platform-contracts">{tenantsWithContracts.map((tenant) => <article key={tenant.id}>
          <div><b>{tenant.displayName}</b><small>{tenant.slug} · atual: {tenant.planName} · {tenant.billingFrequency ?? "sem periodicidade"} · {money(tenant.recurringAmount)}</small><small>Uso atual: {tenant.activeUsers}/{tenant.quotaLimits?.active_users ?? "∞"} usuários · {tenant.publishedPages}/{tenant.quotaLimits?.published_pages ?? "∞"} páginas · {bytes(tenant.storageBytes)}/{tenant.quotaLimits?.storage_bytes === null || tenant.quotaLimits?.storage_bytes === undefined ? "∞" : bytes(tenant.quotaLimits.storage_bytes)}</small></div>
          <details><summary>Editar contrato</summary><form action={saveTenantContractAction} className="form-grid">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <label>Plano<select name="planCode" defaultValue={tenant.planCode ?? "SIMPLE"}><option value="SIMPLE">Simples</option><option value="MEDIUM">Médio</option><option value="UNLIMITED">Ilimitado</option></select></label>
            <label>Periodicidade<select name="frequency" defaultValue={tenant.billingFrequency ?? "MONTHLY"}><option value="MONTHLY">Mensal</option><option value="QUARTERLY">Trimestral</option><option value="ANNUAL">Anual</option></select></label>
            <label>Valor contratado no ciclo (R$)<input name="contractedAmount" type="number" min="0" step="0.01" defaultValue={tenant.contractedAmount ?? "0.00"} required /></label>
            <label>Valor recorrente por ciclo (R$)<input name="recurringAmount" type="number" min="0" step="0.01" defaultValue={tenant.recurringAmount ?? "0.00"} required /></label>
            <label className="form-grid-wide">Motivo da alteração<input name="reason" minLength={8} placeholder="Ex.: contratação do plano Médio" required /></label>
            <div className="form-actions"><button className="button button-primary" type="submit">Salvar versão contratual</button></div>
          </form></details>
          {tenant.suspensionId && tenant.suspensionKind !== "COMMERCIAL" ? <small className="danger-text">Suspensão {tenant.suspensionKind} ativa; exige análise operacional antes de qualquer reativação.</small> : tenant.operationalStatus === "SUSPENDED" && !tenant.suspensionId ? <small className="danger-text">Status suspenso sem suspensão comercial ativa; análise operacional necessária.</small> : <details><summary>{tenant.suspensionId ? "Reativar tenant" : "Suspender tenant"}</summary><form action={setCommercialSuspensionAction} className="platform-suspension-form">
            <input type="hidden" name="tenantId" value={tenant.id} /><input type="hidden" name="action" value={tenant.suspensionId ? "REACTIVATE" : "SUSPEND"} />
            <label>Motivo<textarea name="reason" minLength={8} maxLength={500} placeholder="Registre por que esta decisão está sendo tomada" required /></label>
            <label>Confirmação<input name="confirmation" required placeholder={tenant.suspensionId ? "Digite REATIVAR" : "Digite SUSPENDER"} /></label>
            <small>{tenant.suspensionId ? "A reativação encerra a suspensão comercial ativa; não altera o status financeiro." : "Bloqueia site público, login de membros e publicação. O administrador do tenant fica limitado à tela de situação."}</small>
            <button className={tenant.suspensionId ? "button button-primary" : "button button-secondary"} type="submit">{tenant.suspensionId ? "Reativar instância" : "Suspender instância"}</button>
            {tenant.suspensionId && <small>Suspensão {tenant.suspensionKind}: {tenant.suspensionReason}</small>}
          </form></details>}
        </article>)}{!tenantsWithContracts.length && <p>Nenhum tenant com contrato ativo.</p>}</div>
      </section>

      <section className="panel tenant-table"><header><div><span className="eyebrow dark">CONTAS A RECEBER</span><h2>Cobranças abertas</h2></div></header>
        <div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Situação</th><th>Registrar recebimento</th></tr></thead><tbody>
          {openCharges.map((charge) => <tr key={charge.id}><td><b>{charge.tenantName}</b><small>{charge.tenantSlug}</small></td><td>{date(charge.referencePeriod)}</td><td>{date(charge.dueDate)}</td><td>{money(charge.chargedAmount)}</td><td>{money(charge.outstandingAmount)}</td><td><span className={`pill ${charge.status === "OVERDUE" ? "warning" : "neutral"}`}>{charge.status}</span></td><td><form action={registerManualPaymentAction} className="support-form"><input type="hidden" name="chargeId" value={charge.id}/><input aria-label="Valor recebido" name="amount" type="number" min="0.01" max={charge.outstandingAmount} step="0.01" defaultValue={charge.outstandingAmount} required/><input aria-label="Data do recebimento" name="paidAt" type="date" defaultValue={today} required/><select aria-label="Meio de pagamento" name="method" defaultValue="PIX"><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="TRANSFER">Transferência</option><option value="CARD">Cartão</option></select><input aria-label="Referência externa" name="externalReference" placeholder="Referência (opcional)"/><input aria-label="Comprovante protegido (PDF, JPEG ou PNG, até 10 MB)" name="evidence" type="file" accept="application/pdf,image/jpeg,image/png"/><button className="button button-primary" type="submit">Confirmar</button></form></td></tr>)}
          {!openCharges.length && <tr><td colSpan={7}>Nenhuma cobrança com saldo em aberto.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel tenant-table"><header><div><span className="eyebrow dark">COMPROVANTES</span><h2>Acesso restrito ao Superusuário</h2></div><small>Até 50 recebimentos mais recentes</small></header>
        <div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Recebido em</th><th>Meio</th><th>Valor</th><th>Referência</th><th>Arquivo</th></tr></thead><tbody>
          {receipts.map((receipt) => <tr key={receipt.paymentId}><td><b>{receipt.tenantName}</b><small>{receipt.tenantSlug}</small></td><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(receipt.paidAt)}</td><td>{receipt.method}</td><td>{money(receipt.amount)}</td><td>{receipt.externalReference ?? "—"}</td><td><Link href={`/api/platform/finance/evidence/${receipt.paymentId}`} target="_blank">Abrir comprovante</Link></td></tr>)}
          {!receipts.length && <tr><td colSpan={6}>Nenhum comprovante foi anexado aos recebimentos.</td></tr>}
        </tbody></table></div>
      </section>

      <p className="platform-finance-note">Comprovantes anexados ficam em armazenamento privado, fora do caminho público; somente o Superusuário pode acessá-los e cada acesso é auditado. Os recebimentos continuam sendo confirmados manualmente, sem gateway. Suspensão operacional/comercial não altera automaticamente o status financeiro.</p>
    </main>
  </AdminShell>;
}
