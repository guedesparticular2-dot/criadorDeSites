"use server";

import { redirect } from "next/navigation";
import { bootstrapPlatform, platformIsConfigured } from "../../lib/platform";

export async function setupPlatformAction(formData: FormData) {
  if (await platformIsConfigured()) redirect("/acesso");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (displayName.length < 3 || !email.includes("@") || password.length < 12) {
    redirect("/setup?erro=dados-invalidos");
  }
  await bootstrapPlatform({ displayName, email, password });
  redirect("/acesso?configurada=1");
}
