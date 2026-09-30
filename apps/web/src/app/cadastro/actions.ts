"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { submitRegistration } from "../../lib/registration";
import { getTenantFromHost } from "../../lib/tenant";
import { consumeAuthRateLimit } from "../../lib/auth-rate-limit";

export async function submitRegistrationAction(formData: FormData) {
  const tenant = await getTenantFromHost((await headers()).get("host") ?? "");
  if (!tenant) redirect("/");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!await consumeAuthRateLimit("REGISTRATION", tenant.id, 100, 60 * 60)
    || !await consumeAuthRateLimit("REGISTRATION", `${tenant.id}:${email}`, 5, 60 * 60)) {
    redirect("/cadastro?erro=limite");
  }
  try {
    await submitRegistration(tenant, {
      displayName: String(formData.get("displayName") ?? ""),
      email,
      password: String(formData.get("password") ?? ""),
      birthDate: String(formData.get("birthDate") ?? ""),
      relationshipText: String(formData.get("relationshipText") ?? ""),
      acceptedTerms: formData.get("acceptedTerms") === "on",
      guardianName: String(formData.get("guardianName") ?? ""),
      guardianEmail: String(formData.get("guardianEmail") ?? ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível enviar o cadastro.";
    redirect(`/cadastro?erro=${encodeURIComponent(message)}`);
  }
  redirect("/cadastro?enviado=1");
}
