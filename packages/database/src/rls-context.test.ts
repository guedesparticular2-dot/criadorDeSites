import { describe, expect, it } from "vitest";
import { signRlsContext } from "./rls-context";

describe("signed RLS contexts", () => {
  const env = {
    RLS_CONTEXT_KEY_ID: "web-test",
    RLS_CONTEXT_HMAC_KEY: "0123456789abcdef0123456789abcdef",
    RLS_SYSTEM_CONTEXT_KEY_ID: "worker-test",
    RLS_SYSTEM_CONTEXT_HMAC_KEY: "abcdef0123456789abcdef0123456789",
  };

  it("signs claims deterministically and scopes the signature to the tenant and audience", () => {
    const now = 1_800_000_000_000;
    const context = { scope: "TENANT" as const, tenantId: "tenant-a", userId: "user-a" };
    const first = signRlsContext(context, env, now);
    const repeat = signRlsContext(context, env, now);
    const otherTenant = signRlsContext({ ...context, tenantId: "tenant-b" }, env, now);
    const platform = signRlsContext({ ...context, scope: "PLATFORM" }, env, now);

    expect(first).toEqual(repeat);
    expect(otherTenant.signature).not.toBe(first.signature);
    expect(platform.signature).not.toBe(first.signature);
    expect(JSON.parse(first.payload)).toMatchObject({ v: 1, kid: "web-test", tenantId: "tenant-a", userId: "user-a", scope: "TENANT", exp: 1_800_000_120 });
  });

  it("uses a worker-only key for system scope", () => {
    const signed = signRlsContext({ scope: "SYSTEM" }, env, 1_800_000_000_000);
    expect(JSON.parse(signed.payload).kid).toBe("worker-test");
    expect(signed.signature).not.toBe(signRlsContext({ scope: "PLATFORM" }, env, 1_800_000_000_000).signature);
  });

  it("fails closed when the signing key is missing or too short", () => {
    expect(() => signRlsContext({ scope: "PUBLIC", tenantId: "tenant-a" }, {}, 1_800_000_000_000)).toThrow(/não está configurada/);
    expect(() => signRlsContext({ scope: "PUBLIC", tenantId: "tenant-a" }, { RLS_CONTEXT_KEY_ID: "dev", RLS_CONTEXT_HMAC_KEY: "short" }, 1_800_000_000_000)).toThrow(/32 caracteres/);
  });
});
