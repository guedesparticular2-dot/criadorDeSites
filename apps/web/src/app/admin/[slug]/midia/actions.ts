"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "../../../../lib/auth";
import { receiveMediaUpload } from "../../../../lib/media";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function uploadMediaAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const user = await requireCurrentUser();
    const tenant = await requireTenantPermission(slug, user, "media.upload");
    const media = formData.get("media");
    if (!(media instanceof File)) throw new Error("Escolha uma imagem para enviar.");
    await receiveMediaUpload(tenant.id, user.id, media);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível receber a imagem.";
    redirect(`/admin/${slug}/midia?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/${slug}/midia`);
  redirect(`/admin/${slug}/midia?enviado=1`);
}
