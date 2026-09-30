"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperuser } from "../../lib/auth";
import { provisionTenant, transferPrimaryAdministrator } from "../../lib/platform";

export async function provisionTenantAction(formData: FormData) {
  const user = await requireSuperuser();
  let result: { slug: string };
  try {
    result = await provisionTenant(user.id, {
      slug: String(formData.get("slug") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      planCode: String(formData.get("planCode") ?? "SIMPLE") as "SIMPLE" | "MEDIUM" | "UNLIMITED",
      adminName: String(formData.get("adminName") ?? ""),
      adminEmail: String(formData.get("adminEmail") ?? ""),
      adminPassword: String(formData.get("adminPassword") ?? ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar a instância.";
    redirect(`/platform?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath("/");
  revalidatePath("/platform");
  redirect(`/platform?criada=${encodeURIComponent(result.slug)}`);
}

export async function transferPrimaryAdministratorAction(formData: FormData) {
  const user = await requireSuperuser();
  const slug = String(formData.get("slug") ?? "");
  try {
    await transferPrimaryAdministrator(user.id, slug, String(formData.get("membershipId") ?? ""), String(formData.get("reason") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível transferir a nomeação.";
    redirect(`/platform?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath("/platform");
  redirect(`/platform?transferido=${encodeURIComponent(slug)}`);
}
