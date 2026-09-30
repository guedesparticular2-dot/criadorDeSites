"use server";

import { redirect } from "next/navigation";
import { resetPassword } from "../../lib/password-reset";

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await resetPassword(token, String(formData.get("password") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível redefinir a senha.";
    redirect(`/redefinir-senha?token=${encodeURIComponent(token)}&erro=${encodeURIComponent(message)}`);
  }
  redirect("/acesso?senha-redefinida=1");
}
