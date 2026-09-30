export type ActorKind = "VISITOR" | "MEMBER" | "ADMIN" | "PRIMARY_ADMIN" | "SUPERUSER";

export interface TenantSuspensionPolicy {
  blockPublicAccess: boolean;
  blockMemberLogin: boolean;
  allowLimitedAdminAccess: boolean;
  blockPublication: boolean;
}

export interface TenantAccessDecision {
  allowed: boolean;
  mode: "FULL" | "LIMITED" | "BLOCKED";
  reason?: "PUBLIC_SUSPENDED" | "MEMBER_SUSPENDED" | "ADMIN_SUSPENDED" | "PUBLICATION_BLOCKED";
}

export function decideTenantAccess(
  actor: ActorKind,
  policy: TenantSuspensionPolicy | null,
  operation: "READ" | "PUBLISH" = "READ",
): TenantAccessDecision {
  if (!policy) return { allowed: true, mode: "FULL" };
  if (actor === "SUPERUSER") return { allowed: true, mode: "FULL" };
  if (operation === "PUBLISH" && policy.blockPublication) {
    return { allowed: false, mode: "BLOCKED", reason: "PUBLICATION_BLOCKED" };
  }
  if (actor === "VISITOR" && policy.blockPublicAccess) {
    return { allowed: false, mode: "BLOCKED", reason: "PUBLIC_SUSPENDED" };
  }
  if (actor === "MEMBER" && policy.blockMemberLogin) {
    return { allowed: false, mode: "BLOCKED", reason: "MEMBER_SUSPENDED" };
  }
  if (actor === "ADMIN" || actor === "PRIMARY_ADMIN") {
    return policy.allowLimitedAdminAccess
      ? { allowed: true, mode: "LIMITED" }
      : { allowed: false, mode: "BLOCKED", reason: "ADMIN_SUSPENDED" };
  }
  return { allowed: true, mode: "FULL" };
}
