"use server";

import { redirect } from "next/navigation";
import { requestPasswordReset } from "../../lib/password-reset";

export async function requestPasswordResetAction(formData: FormData) {
  try {
    await requestPasswordReset(String(formData.get("email") ?? ""));
  } catch {
    // Public response remains indistinguishable for unknown accounts and provider/configuration failures.
  }
  redirect("/recuperar-senha?enviado=1");
}
