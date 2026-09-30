"use client";

import { useEffect, useState } from "react";

type Notice = { id: string; title: string; summary: string | null; occursAt: string; targetUrl: string | null; happened: boolean };

export function PublicNotice({ notice }: { notice: Notice }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(notice.occursAt).getTime() - Date.now()));
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 60_000)), 60_000);
    return () => window.clearInterval(timer);
  }, [remaining > 0]);
  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const restMinutes = minutes % 60;
  const content = <><span className="eyebrow dark">{remaining ? "PRÓXIMO ENCONTRO" : "ACONTECEU"}</span><b>{notice.title}</b>{notice.summary && <span>{notice.summary}</span>}<small>{remaining ? `${days} dias · ${hours} horas · ${restMinutes} min` : new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(notice.occursAt))}</small></>;
  return notice.targetUrl ? <a className="public-notice" href={notice.targetUrl}>{content}</a> : <article className="public-notice">{content}</article>;
}
