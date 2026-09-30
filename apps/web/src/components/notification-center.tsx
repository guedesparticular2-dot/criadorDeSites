"use client";

import { useEffect, useRef, useState } from "react";

type Notice = { id: string; title: string; body: string; createdAt: string };

export function NotificationCenter({ initialNotifications }: { initialNotifications: Notice[] }) {
  const [notices, setNotices] = useState(initialNotifications);
  const acknowledgeButton = useRef<HTMLButtonElement>(null);
  const current = notices[0];
  useEffect(() => { if (current) acknowledgeButton.current?.focus(); }, [current?.id]);
  if (!current) return null;
  const activeNotice = current;
  async function acknowledge() {
    const response = await fetch(`/api/v1/notifications/${activeNotice.id}/read`, { method: "POST" });
    if (response.ok) setNotices((items) => items.filter((item) => item.id !== activeNotice.id));
  }
  return <div className="notification-backdrop" role="presentation"><section className="notification-dialog" role="alertdialog" aria-modal="true" aria-labelledby="notification-title"><span className="eyebrow dark">AVISO DA MODERAÇÃO</span><h2 id="notification-title">{activeNotice.title}</h2><p>{activeNotice.body}</p><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activeNotice.createdAt))}</small><button ref={acknowledgeButton} className="button button-primary" onClick={acknowledge}>Entendi</button></section></div>;
}
