import { afterEach, describe, expect, it } from "vitest";
import {
  createRecoveryCodes,
  decryptMfaValue,
  encryptMfaValue,
  recoveryCodeHash,
  verifyTotpCode,
} from "./mfa";

const priorKey = process.env.MFA_ENCRYPTION_KEY;
afterEach(() => {
  if (priorKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
  else process.env.MFA_ENCRYPTION_KEY = priorKey;
});

describe("MFA primitives", () => {
  it("validates the RFC 6238 SHA-1 six-digit truncation and rejects malformed codes", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotpCode(secret, "287082", 59_000)).toBe(1);
    expect(verifyTotpCode(secret, "28 7082", 59_000)).toBe(1);
    expect(verifyTotpCode(secret, "invalid", 59_000)).toBeNull();
  });

  it("generates one-time recovery values and hashes them normalization-safely", () => {
    const codes = createRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/.test(code))).toBe(true);
    expect(recoveryCodeHash("ABCD-EF01-2345-6789")).toBe(recoveryCodeHash("abcdef0123456789"));
  });

  it("encrypts MFA secrets with authenticated encryption", () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    const ciphertext = encryptMfaValue("TOPSECRET");
    expect(ciphertext).not.toContain("TOPSECRET");
    expect(decryptMfaValue(ciphertext)).toBe("TOPSECRET");
    expect(() => decryptMfaValue(`${ciphertext}tampered`)).toThrow();
  });
});
