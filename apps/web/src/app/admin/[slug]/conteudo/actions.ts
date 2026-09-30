"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "../../../../lib/auth";
import { createNewsDraft, createNoticeDraft, createPollDraft, publishContentRelease } from "../../../../lib/content";
import { requireTenantPermission } from "../../../../lib/tenant";

export async function createNewsDraftAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const user = await requireCurrentUser();
    const tenant = await requireTenantPermission(slug, user, "content.edit");
    await createNewsDraft(tenant.id, user.id, {
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar o rascunho.";
    redirect(`/admin/${slug}/conteudo?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/${slug}/conteudo`);
  redirect(`/admin/${slug}/conteudo?rascunho=1`);
}

export async function publishContentReleaseAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const user = await requireCurrentUser();
    const tenant = await requireTenantPermission(slug, user, "content.publish");
    await publishContentRelease(tenant.id, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível publicar a release.";
    redirect(`/admin/${slug}/conteudo?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath("/");
  revalidatePath(`/admin/${slug}`);
  revalidatePath(`/admin/${slug}/conteudo`);
  redirect(`/admin/${slug}/conteudo?publicado=1`);
}

export async function createPollDraftAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const user = await requireCurrentUser();
    const tenant = await requireTenantPermission(slug, user, "content.edit");
    await createPollDraft(tenant.id, user.id, { title: String(formData.get("title") ?? ""), summary: String(formData.get("summary") ?? ""), options: formData.getAll("option").map(String), opensAt: String(formData.get("opensAt") ?? ""), closesAt: String(formData.get("closesAt") ?? "") });
  } catch (error) { redirect(`/admin/${slug}/conteudo?erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível criar a enquete.")}`); }
  revalidatePath(`/admin/${slug}/conteudo`);
  redirect(`/admin/${slug}/conteudo?enquete=1`);
}

export async function createNoticeDraftAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const user = await requireCurrentUser();
    const tenant = await requireTenantPermission(slug, user, "content.edit");
    await createNoticeDraft(tenant.id, user.id, { title: String(formData.get("title") ?? ""), summary: String(formData.get("summary") ?? ""), occursAt: String(formData.get("occursAt") ?? ""), expiresAt: String(formData.get("expiresAt") ?? ""), targetUrl: String(formData.get("targetUrl") ?? "") });
  } catch (error) { redirect(`/admin/${slug}/conteudo?erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível criar o aviso.")}`); }
  revalidatePath(`/admin/${slug}/conteudo`);
  redirect(`/admin/${slug}/conteudo?aviso=1`);
}
