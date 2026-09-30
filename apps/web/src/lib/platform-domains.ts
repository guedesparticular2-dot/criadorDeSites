import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { lookup, resolveTxt } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { domainToASCII } from "node:url";
import { createDatabaseClient } from "@baixada/database/client";
import { setRlsContext } from "@baixada/database/rls-context";

const tokenHash = (token: string) => createHash("sha256").update(token).digest();

export type PlatformDomain = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  hostname: string;
  isCanonical: boolean;
  verificationStatus: string;
  tlsStatus: string;
  challengeId: string | null;
  challengeMethod: string | null;
  challengeExpiresAt: Date | null;
};

function normaliseHostname(value: string) {
  const hostname = domainToASCII(value.trim().replace(/\.$/, "").toLowerCase());
  if (!hostname || hostname.length > 253 || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Informe um domínio público válido, sem protocolo, caminho ou porta.");
  }
  const labels = hostname.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error("O domínio contém um nome ou rótulo inválido.");
  }
  return hostname;
}

function ipv4Number(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255 || !Number.isInteger(part))) return null;
  return parts.reduce((result, part) => result * 256 + part, 0);
}

function isPublicIpv4(address: string) {
  const value = ipv4Number(address);
  if (value === null) return false;
  const ranges: [number, number][] = [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
    [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
    [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
    [0xe0000000, 4], [0xf0000000, 4],
  ];
  return !ranges.some(([network, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(network / 2 ** (32 - bits)));
}

async function getPublicIpv4(hostname: string) {
  const addresses = await lookup(hostname, { all: true, family: 4, verbatim: true });
  const publicAddresses = addresses.filter((address) => isPublicIpv4(address.address));
  if (!publicAddresses.length) throw new Error("O domínio não resolve para um endereço IPv4 público seguro.");
  return publicAddresses;
}

async function readVerificationFile(hostname: string) {
  const addresses = await getPublicIpv4(hostname);
  const address = addresses[0]!.address;
  const family = addresses[0]!.family;
  const url = new URL(`http://${hostname}/.well-known/baixada-verification.txt`);
  const body = await new Promise<string>((resolve, reject) => {
    const request = httpRequest(url, {
      method: "GET",
      timeout: 5000,
      lookup: (_name, _options, callback) => callback(null, address, family),
      headers: { accept: "text/plain", "user-agent": "BaixadaDomainVerification/1.0" },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`O arquivo HTTP de verificação retornou HTTP ${response.statusCode ?? "sem status"}.`));
        return;
      }
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        text += chunk;
        if (text.length > 512) request.destroy(new Error("O arquivo de verificação excede 512 caracteres."));
      });
      response.on("end", () => resolve(text.trim()));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Tempo limite ao consultar o arquivo HTTP de verificação.")));
    request.on("error", reject);
    request.end();
  });
  return body;
}

async function readDnsVerification(hostname: string) {
  const records = await resolveTxt(`_baixada-verification.${hostname}`);
  return records.map((segments) => segments.join("").trim());
}

async function assertHttps(hostname: string) {
  const addresses = await getPublicIpv4(hostname);
  const address = addresses[0]!.address;
  const family = addresses[0]!.family;
  const url = new URL(`https://${hostname}/`);
  await new Promise<void>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "HEAD",
      timeout: 5000,
      lookup: (_name, _options, callback) => callback(null, address, family),
      headers: { "user-agent": "BaixadaTlsCheck/1.0" },
    }, (response) => {
      response.resume();
      if ((response.statusCode ?? 599) >= 500) reject(new Error(`A origem respondeu HTTP ${response.statusCode}; TLS não foi ativado.`));
      else resolve();
    });
    request.on("timeout", () => request.destroy(new Error("Tempo limite ao verificar TLS do domínio.")));
    request.on("error", reject);
    request.end();
  });
}

export async function listPlatformDomains(actorUserId: string): Promise<PlatformDomain[]> {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      return tx<PlatformDomain[]>`
        select domain.id, domain.tenant_id as "tenantId", tenant.display_name as "tenantName", tenant.slug as "tenantSlug",
          domain.hostname, domain.is_canonical as "isCanonical", domain.verification_status as "verificationStatus",
          domain.tls_status as "tlsStatus", challenge.id as "challengeId", challenge.method as "challengeMethod",
          challenge.expires_at as "challengeExpiresAt"
        from tenant_domains domain join tenants tenant on tenant.id = domain.tenant_id
        left join lateral (
          select candidate.id, candidate.method, candidate.expires_at
          from tenant_domain_challenges candidate
          where candidate.tenant_id = domain.tenant_id and candidate.domain_id = domain.id
            and candidate.verified_at is null and candidate.attempts < 8 and candidate.expires_at > now()
          order by candidate.created_at desc limit 1
        ) challenge on true
        where tenant.operational_status <> 'CLOSED'
        order by tenant.display_name, domain.is_canonical desc, domain.hostname
      `;
    });
  } finally { await sql.end(); }
}

export async function listDomainTenantOptions(actorUserId: string) {
  const sql = createDatabaseClient();
  try {
    return await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      return tx<{ id: string; displayName: string; slug: string }[]>`
        select id, display_name as "displayName", slug from tenants
        where operational_status <> 'CLOSED' order by display_name
      `;
    });
  } finally { await sql.end(); }
}

export async function createDomainChallenge(actorUserId: string, input: { tenantId: string; hostname: string; method: string }) {
  const hostname = normaliseHostname(input.hostname);
  if (!["DNS_TXT", "HTTP_FILE"].includes(input.method)) throw new Error("Método de verificação inválido.");
  const challengeId = randomUUID();
  const token = randomUUID().replaceAll("-", "");
  const hash = tokenHash(token).toString("hex");
  let domainId = "";
  const sql = createDatabaseClient();
  try {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const tenants = await tx<{ displayName: string }[]>`select display_name as "displayName" from tenants where id = ${input.tenantId} and operational_status <> 'CLOSED' limit 1`;
      if (!tenants[0]) throw new Error("Instância não encontrada.");
      const existing = await tx<{ id: string; tenantId: string; verificationStatus: string }[]>`
        select id, tenant_id as "tenantId", verification_status as "verificationStatus"
        from tenant_domains where lower(hostname) = ${hostname} limit 1 for update
      `;
      domainId = existing[0]?.id ?? "";
      if (existing[0] && existing[0].tenantId !== input.tenantId) throw new Error("Este hostname já pertence a outra instância.");
      if (!domainId) {
        domainId = randomUUID();
        await tx`insert into tenant_domains (id, tenant_id, hostname, kind) values (${domainId}, ${input.tenantId}, ${hostname}, 'CUSTOM')`;
      } else if (existing[0]?.verificationStatus === "VERIFIED") {
        throw new Error("Este domínio já está verificado. Não é necessário emitir outro desafio.");
      }
      await tx`update tenant_domain_challenges set expires_at = now() where tenant_id = ${input.tenantId} and domain_id = ${domainId} and verified_at is null and expires_at > now()`;
      await tx`
        insert into tenant_domain_challenges (id, tenant_id, domain_id, method, token_hash, expires_at)
        values (${challengeId}, ${input.tenantId}, ${domainId}, ${input.method}, ${hash}, now() + interval '24 hours')
      `;
      await tx`update tenant_domains set verification_status = 'PENDING', updated_at = now() where id = ${domainId} and tenant_id = ${input.tenantId}`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${input.tenantId}, ${actorUserId}, 'USER', 'CUSTOM_DOMAIN_CHALLENGE_CREATED', 'TENANT_DOMAIN', ${domainId}, ${randomUUID()},
          ${JSON.stringify({ hostname, method: input.method, challengeId })}::jsonb)
      `;
    });
  } finally { await sql.end(); }
  return {
    domainId,
    hostname,
    method: input.method,
    token,
    proofName: input.method === "DNS_TXT" ? `_baixada-verification.${hostname}` : "http://" + hostname + "/.well-known/baixada-verification.txt",
  };
}

export async function verifyDomainChallenge(actorUserId: string, domainId: string) {
  const sql = createDatabaseClient();
  let challenge: { id: string; tenantId: string; domainId: string; hostname: string; method: string; tokenHash: string } | undefined;
  try {
    const rows = await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      return tx<{ id: string; tenantId: string; domainId: string; hostname: string; method: string; tokenHash: string }[]>`
        select challenge.id, challenge.tenant_id as "tenantId", challenge.domain_id as "domainId", domain.hostname,
          challenge.method, challenge.token_hash as "tokenHash"
        from tenant_domain_challenges challenge join tenant_domains domain on domain.id = challenge.domain_id and domain.tenant_id = challenge.tenant_id
        where domain.id = ${domainId} and challenge.verified_at is null and challenge.attempts < 8 and challenge.expires_at > now()
        order by challenge.created_at desc limit 1
      `;
    });
    challenge = rows[0];
  } finally { await sql.end(); }
  if (!challenge) throw new Error("Não há desafio de domínio ativo; emita um novo desafio.");

  let proofValues: string[] = [];
  let networkError: Error | null = null;
  try {
    proofValues = challenge.method === "DNS_TXT" ? await readDnsVerification(challenge.hostname) : [await readVerificationFile(challenge.hostname)];
  } catch (error) { networkError = error instanceof Error ? error : new Error("Não foi possível consultar a prova pública."); }
  const wanted = Buffer.from(challenge.tokenHash, "hex");
  const valid = proofValues.some((proof) => {
    const received = tokenHash(proof);
    return received.length === wanted.length && timingSafeEqual(received, wanted);
  });

  const db = createDatabaseClient();
  try {
    const result = await db.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      const challenges = await tx<{ attempts: number; tenantId: string }[]>`
        select attempts, tenant_id as "tenantId" from tenant_domain_challenges
        where id = ${challenge.id} and domain_id = ${domainId} and verified_at is null and expires_at > now() for update
      `;
      if (!challenges[0]) throw new Error("O desafio expirou ou já foi confirmado. Emita um novo.");
      const attempts = challenges[0].attempts + 1;
      if (!valid) {
        await tx`update tenant_domain_challenges set attempts = ${attempts} where id = ${challenge.id}`;
        if (attempts >= 8) await tx`update tenant_domains set verification_status = 'FAILED', updated_at = now() where id = ${domainId}`;
        return { valid: false, attempts };
      }
      await tx`update tenant_domain_challenges set attempts = ${attempts}, verified_at = now() where id = ${challenge.id}`;
      await tx`update tenant_domains set verification_status = 'VERIFIED', verified_at = now(), updated_at = now() where id = ${domainId}`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, after_data)
        values (${randomUUID()}, ${challenges[0].tenantId}, ${actorUserId}, 'USER', 'CUSTOM_DOMAIN_VERIFIED', 'TENANT_DOMAIN', ${domainId}, ${randomUUID()},
          ${JSON.stringify({ hostname: challenge.hostname, method: challenge.method })}::jsonb)
      `;
      return { valid: true, attempts };
    });
    if (!result.valid) throw new Error(networkError?.message ?? `Prova não encontrada. Verifique o registro e tente novamente (${8 - result.attempts} tentativas restantes).`);
  } finally { await db.end(); }
}

export async function activateCanonicalDomain(actorUserId: string, domainId: string, reason: string, tlsProbe: (hostname: string) => Promise<void> = assertHttps) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 8) throw new Error("Informe o motivo da ativação (mínimo de 8 caracteres).");
  const sql = createDatabaseClient();
  try {
    const rows = await sql.begin(async (tx) => {
      await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      return tx<{ hostname: string; tenantId: string; verificationStatus: string }[]>`
        select hostname, tenant_id as "tenantId", verification_status as "verificationStatus"
        from tenant_domains where id = ${domainId} limit 1
      `;
    });
    const domain = rows[0];
    if (!domain || domain.verificationStatus !== "VERIFIED") throw new Error("Verifique a posse do domínio antes de torná-lo canônico.");
    await tlsProbe(domain.hostname);
    await sql.begin(async (tx) => {
        await setRlsContext(tx, { scope: "PLATFORM", userId: actorUserId });
      await tx`select id from tenants where id = ${domain.tenantId} for update`;
      const current = await tx<{ id: string; hostname: string }[]>`select id, hostname from tenant_domains where tenant_id = ${domain.tenantId} and is_canonical = true limit 1 for update`;
      await tx`update tenant_domains set is_canonical = false, updated_at = now() where tenant_id = ${domain.tenantId} and is_canonical = true`;
      await tx`update tenant_domains set is_canonical = true, tls_status = 'ACTIVE', updated_at = now() where id = ${domainId} and tenant_id = ${domain.tenantId} and verification_status = 'VERIFIED'`;
      await tx`
        insert into audit_events (id, tenant_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, reason, before_data, after_data)
        values (${randomUUID()}, ${domain.tenantId}, ${actorUserId}, 'USER', 'CANONICAL_DOMAIN_CHANGED', 'TENANT_DOMAIN', ${domainId}, ${randomUUID()}, ${cleanReason},
          ${JSON.stringify({ previousDomainId: current[0]?.id ?? null, previousHostname: current[0]?.hostname ?? null })}::jsonb,
          ${JSON.stringify({ hostname: domain.hostname, tlsStatus: 'ACTIVE' })}::jsonb)
      `;
    });
  } finally { await sql.end(); }
}
