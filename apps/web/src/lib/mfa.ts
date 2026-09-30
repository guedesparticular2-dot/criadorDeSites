import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const totpPeriodSeconds = 30;

function encryptionKey() {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (!configured) throw new Error("A chave MFA_ENCRYPTION_KEY não está configurada.");
  const key = Buffer.from(configured, "base64url");
  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY deve conter 32 bytes em base64url.");
  return key;
}

function base32Encode(input: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of input.replace(/[^A-Z2-7]/gi, "").toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error("Segredo TOTP inválido.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function encryptMfaValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMfaValue(ciphertext: string) {
  const [ivEncoded, tagEncoded, contentEncoded] = ciphertext.split(".");
  if (!ivEncoded || !tagEncoded || !contentEncoded) throw new Error("Dado MFA cifrado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(contentEncoded, "base64url")), decipher.final()]).toString("utf8");
}

function codeForStep(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  const value = ((digest[offset]! & 127) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return String(value % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secret: string, suppliedCode: string, now = Date.now()) {
  const normalized = suppliedCode.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const currentStep = Math.floor(now / 1000 / totpPeriodSeconds);
  for (const offset of [-1, 0, 1]) {
    const expected = codeForStep(secret, currentStep + offset);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return currentStep + offset;
  }
  return null;
}

export function recoveryCodeHash(code: string) {
  return createHash("sha256").update(code.replace(/[^A-Z0-9]/gi, "").toUpperCase()).digest("hex");
}

export function createRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const value = randomBytes(8).toString("hex").toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
  });
}
