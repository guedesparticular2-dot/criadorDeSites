"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "../../../../lib/auth";
import { acceptAdminInvitation, createAdminInvitation, isPrimaryTenantAdministrator, reviewRegistration, setAdminPermissionOverride, setAdministratorRole, suspendMembership } from "../../../../lib/people";
import { requireTenantAdministrator, requireTenantPermission } from "../../../../lib/tenant";
import { consumeAuthRateLimit } from "../../../../lib/auth-rate-limit";

async function resolvePeopleContext(formData: FormData, permission: "people.manage" | "people.approve" = "people.manage") {
  const user = await requireCurrentUser();
  const slug = String(formData.get("slug") ?? "");
  const tenant = await requireTenantPermission(slug, user, permission);
  return { user, slug, tenant };
}

export async function reviewRegistrationAction(formData: FormData) {
  let slug = String(formData.get("slug") ?? "");
  try {
    const { user, tenant } = await resolvePeopleContext(formData, "people.approve");
    await reviewRegistration(tenant.id, user.id, String(formData.get("requestId") ?? ""), String(formData.get("decision") ?? "") === "APPROVE" ? "APPROVE" : "REJECT", String(formData.get("reason") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível revisar o cadastro.";
    redirect(`/admin/${slug}/pessoas?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/${slug}/pessoas`);
  redirect(`/admin/${slug}/pessoas?atualizado=1`);
}

export async function setAdministratorRoleAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const { user, tenant } = await resolvePeopleContext(formData);
    await setAdministratorRole(tenant.id, user.id, String(formData.get("membershipId") ?? ""), formData.get("enabled") === "true");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível alterar o papel.";
    redirect(`/admin/${slug}/pessoas?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/${slug}/pessoas`);
  redirect(`/admin/${slug}/pessoas?atualizado=1`);
}

export async function suspendMembershipAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const { user, tenant } = await resolvePeopleContext(formData);
    await suspendMembership(tenant.id, user.id, String(formData.get("membershipId") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível suspender o vínculo.";
    redirect(`/admin/${slug}/pessoas?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/${slug}/pessoas`);
  redirect(`/admin/${slug}/pessoas?atualizado=1`);
}

export async function createAdminInvitationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const { user, tenant } = await resolvePeopleContext(formData);
    if (!await consumeAuthRateLimit("ADMIN_INVITE", `${tenant.id}:${user.id}`, 10, 60 * 60)) {
      throw new Error("Limite de convites atingido. Tente novamente mais tarde.");
    }
    await createAdminInvitation(tenant.id, user.id, {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      relationshipText: String(formData.get("relationshipText") ?? ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível enviar o convite.";
    redirect(`/admin/${slug}/pessoas?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/${slug}/pessoas`);
  redirect(`/admin/${slug}/pessoas?convite=1`);
}

export async function setAdminPermissionOverrideAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  try {
    const user = await requireCurrentUser();
    const tenant = await requireTenantAdministrator(slug, user);
    if (!user.isSuperuser && !await isPrimaryTenantAdministrator(tenant.id, user.id)) {
      throw new Error("Somente o Administrador Principal ou o Superusuário podem alterar permissões.");
    }
    const effect = String(formData.get("effect") ?? "DEFAULT");
    if (effect !== "ALLOW" && effect !== "DENY" && effect !== "DEFAULT") throw new Error("Efeito de permissão inválido.");
    await setAdminPermissionOverride(tenant.id, user.id, String(formData.get("membershipId") ?? ""), String(formData.get("permissionCode") ?? ""), effect);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível alterar a permissão.";
    redirect(`/admin/${slug}/pessoas?erro=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/${slug}/pessoas`);
  redirect(`/admin/${slug}/pessoas?permissao=1`);
}

export async function acceptAdminInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!await consumeAuthRateLimit("LOGIN", `INVITE:${token}`, 8, 60 * 60)) redirect(`/convites/administrador?token=${encodeURIComponent(token)}&erro=limite`);
  try {
    await acceptAdminInvitation(token, {
      displayName: String(formData.get("displayName") ?? ""),
      birthDate: String(formData.get("birthDate") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível aceitar o convite.";
    redirect(`/convites/administrador?token=${encodeURIComponent(token)}&erro=${encodeURIComponent(message)}`);
  }
  redirect("/acesso?convite=aceito");
}
