"use server";

import { redirect } from "next/navigation";
import { completeMfaEnrollment, finishMfaEnrollment, verifyMfaAuthentication } from "../../../lib/auth";

export async function confirmMfaEnrollmentAction(formData: FormData) {
  try {
    await completeMfaEnrollment(String(formData.get("code") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível confirmar o autenticador.";
    redirect(`/acesso/mfa/configurar?erro=${encodeURIComponent(message)}`);
  }
  redirect("/acesso/mfa/recuperacao");
}

export async function confirmMfaAuthenticationAction(formData: FormData) {
  try {
    await verifyMfaAuthentication(String(formData.get("code") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível validar o segundo fator.";
    redirect(`/acesso/mfa?erro=${encodeURIComponent(message)}`);
  }
  redirect("/admin");
}

export async function finishMfaEnrollmentAction() {
  try {
    await finishMfaEnrollment();
  } catch {
    redirect("/acesso?erro=mfa-expirado");
  }
  redirect("/admin");
}
