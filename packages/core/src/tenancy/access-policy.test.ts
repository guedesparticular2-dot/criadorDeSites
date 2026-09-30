import { describe, expect, it } from "vitest";
import { decideTenantAccess, type TenantSuspensionPolicy } from "./access-policy";

const suspended: TenantSuspensionPolicy = {
  blockPublicAccess: true,
  blockMemberLogin: true,
  allowLimitedAdminAccess: true,
  blockPublication: true,
};

describe("tenant suspension policy", () => {
  it("blocks visitors and members", () => {
    expect(decideTenantAccess("VISITOR", suspended).allowed).toBe(false);
    expect(decideTenantAccess("MEMBER", suspended).allowed).toBe(false);
  });

  it("allows limited admin access but blocks publication", () => {
    expect(decideTenantAccess("ADMIN", suspended)).toMatchObject({ allowed: true, mode: "LIMITED" });
    expect(decideTenantAccess("ADMIN", suspended, "PUBLISH").reason).toBe("PUBLICATION_BLOCKED");
  });

  it("keeps superuser access", () => {
    expect(decideTenantAccess("SUPERUSER", suspended)).toMatchObject({ allowed: true, mode: "FULL" });
  });
});
