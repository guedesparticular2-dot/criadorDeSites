"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "../../../lib/auth";
import { requireTenantPermission, updateTenantAppearance } from "../../../lib/tenant";

export async function updateAppearanceAction(formData: FormData) {
  const user = await requireCurrentUser();
  const slug = String(formData.get("slug") ?? "");
  try {
    const tenant = await requireTenantPermission(slug, user, "tenant.appearance.publish");
    await updateTenantAppearance(tenant, user.id, {
      displayName: String(formData.get("displayName") ?? ""),
      legalName: String(formData.get("legalName") ?? ""),
      blue: String(formData.get("blue") ?? ""),
      green: String(formData.get("green") ?? ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível publicar a aparência.";
    redirect(`/admin/${slug}?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath("/");
  revalidatePath(`/admin/${slug}`);
  redirect(`/admin/${slug}?atualizado=1`);
}
