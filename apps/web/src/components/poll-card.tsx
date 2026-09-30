"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Poll = { id: string; title: string; summary: string | null; opensAt: string; closesAt: string; hasVoted: boolean; showResults: boolean; options: Array<{ id: string; label: string; votes: number }> };

export function PollCard({ poll, canParticipate }: { poll: Poll; canParticipate: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const open = now >= new Date(poll.opensAt).getTime() && now < new Date(poll.closesAt).getTime();
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
  async function vote() {
    if (!selected) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/polls/${poll.id}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId: selected }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar o voto.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível registrar o voto."); }
    finally { setBusy(false); }
  }
  return <article className="poll-card"><span className="eyebrow dark">ENQUETE DA COMUNIDADE</span><h3>{poll.title}</h3>{poll.summary && <p>{poll.summary}</p>}{open && !poll.hasVoted && <fieldset className="poll-options"><legend className="sr-only">Escolha uma opção, o voto não poderá ser alterado.</legend>{poll.options.map((option) => <label key={option.id}><input type="radio" name={`poll-${poll.id}`} value={option.id} checked={selected === option.id} disabled={!canParticipate} onChange={() => setSelected(option.id)} /><span>{option.label}</span></label>)}</fieldset>}{poll.showResults && <div className="poll-results"><ul>{poll.options.map((option) => { const percentage = total ? Math.round(option.votes * 100 / total) : 0; return <li key={option.id}><div><b>{option.label}</b><span>{percentage}% · {option.votes} {option.votes === 1 ? "voto" : "votos"}</span></div><progress max="100" value={percentage} aria-label={`${option.label}: ${percentage}%`} /></li>; })}</ul><table className="poll-text-results"><caption>Resultado acessível em texto</caption><thead><tr><th>Opção</th><th>Votos</th><th>Percentual</th></tr></thead><tbody>{poll.options.map((option) => <tr key={option.id}><th scope="row">{option.label}</th><td>{option.votes}</td><td>{total ? Math.round(option.votes * 100 / total) : 0}%</td></tr>)}</tbody></table><p>Total: {total} {total === 1 ? "voto" : "votos"}</p></div>}{open && !poll.hasVoted && canParticipate && <button className="button button-primary" disabled={!selected || busy} onClick={vote}>Registrar meu voto</button>}{open && !poll.hasVoted && !canParticipate && <p><Link href="/acesso">Acesse sua conta</Link> para votar. Apenas membros aprovados podem participar.</p>}{poll.hasVoted && <p className="poll-confirmation">Seu voto foi registrado e não pode ser alterado.</p>}{!open && <p className="poll-confirmation">{now < new Date(poll.opensAt).getTime() ? "A votação ainda não começou." : "Esta enquete foi encerrada."}</p>}{message && <p className="form-error" role="alert">{message}</p>}</article>;
}
