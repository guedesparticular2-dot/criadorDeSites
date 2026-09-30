"use server";

import { redirect } from "next/navigation";
import { requireSuperuser } from "../../../lib/auth";
import { endSupportAccess, startSupportAccess } from "../../../lib/tenant";

export async function startSupportAccessAction(formData: FormData) {
  const user = await requireSuperuser();
  const slug = String(formData.get("slug") ?? "");
  try {
    await startSupportAccess(user, slug, String(formData.get("reason") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar o suporte.";
    redirect(`/platform/suporte?erro=${encodeURIComponent(message)}`);
  }
  redirect(`/admin/${slug}?suporte=1`);
}

export async function endSupportAccessAction(formData: FormData) {
  const user = await requireSuperuser();
  try { await endSupportAccess(user, String(formData.get("sessionId") ?? "")); }
  catch (error) { redirect(`/platform/suporte?erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível encerrar o suporte.")}`); }
  redirect("/platform/suporte?encerrado=1");
}
