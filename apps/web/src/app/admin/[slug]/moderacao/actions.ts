"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "../../../../lib/auth";
import { hideMediaPendingReview, registerMediaConsent, revokeMediaConsent } from "../../../../lib/moderation";
import { moderateComment } from "../../../../lib/community";
import { requireTenantPermission } from "../../../../lib/tenant";

async function context(formData: FormData, permission: string) {
  const user = await requireCurrentUser();
  const slug = String(formData.get("slug") ?? "");
  const tenant = await requireTenantPermission(slug, user, permission);
  return { user, slug, tenant };
}

export async function registerConsentAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const { user, tenant } = await context(formData, "media.upload");
    await registerMediaConsent(tenant.id, user.id, { mediaId: String(formData.get("mediaId") ?? ""), subjectReference: String(formData.get("subjectReference") ?? ""), documentReference: String(formData.get("documentReference") ?? ""), guardianName: String(formData.get("guardianName") ?? ""), guardianEmail: String(formData.get("guardianEmail") ?? ""), validUntil: String(formData.get("validUntil") ?? "") });
  } catch (error) { redirect(`/admin/${slug}/moderacao?erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível registrar o consentimento.")}`); }
  revalidatePath(`/admin/${slug}/moderacao`);
  redirect(`/admin/${slug}/moderacao?consentimento=1`);
}

export async function revokeConsentAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const { user, tenant } = await context(formData, "media.upload");
    await revokeMediaConsent(tenant.id, user.id, String(formData.get("consentId") ?? ""), String(formData.get("reason") ?? ""));
  } catch (error) { redirect(`/admin/${slug}/moderacao?erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível revogar o consentimento.")}`); }
  revalidatePath(`/admin/${slug}/moderacao`);
  redirect(`/admin/${slug}/moderacao?revogado=1`);
}

export async function hideMediaAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const { user, tenant } = await context(formData, "media.upload");
    await hideMediaPendingReview(tenant.id, user.id, String(formData.get("mediaId") ?? ""), String(formData.get("reason") ?? ""));
  } catch (error) { redirect(`/admin/${slug}/moderacao?erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível ocultar a mídia.")}`); }
  revalidatePath(`/admin/${slug}/moderacao`);
  redirect(`/admin/${slug}/moderacao?oculto=1`);
}

export async function moderateCommentAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const commentId = String(formData.get("commentId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  try {
    const { user, tenant } = await context(formData, "comments.moderate");
    if (decision !== "HIDE" && decision !== "REMOVE" && decision !== "KEEP") throw new Error("Decisão de moderação inválida.");
    await moderateComment(tenant.id, user.id, commentId, decision, String(formData.get("reason") ?? ""));
  } catch (error) { redirect(`/admin/${slug}/moderacao?erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível moderar o comentário.")}`); }
  revalidatePath(`/admin/${slug}/moderacao`);
  redirect(`/admin/${slug}/moderacao?moderado=1`);
}
