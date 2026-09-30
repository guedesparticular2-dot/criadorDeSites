export type PlanCode = "SIMPLE" | "MEDIUM" | "UNLIMITED";

export interface PlanQuota {
  activeUsers: number | null;
  publishedPages: number | null;
  storageBytes: number;
}

export const PLAN_QUOTAS: Record<PlanCode, PlanQuota> = {
  SIMPLE: { activeUsers: 20, publishedPages: 10, storageBytes: 500 * 1024 * 1024 },
  MEDIUM: { activeUsers: 50, publishedPages: 20, storageBytes: 1024 * 1024 * 1024 },
  UNLIMITED: { activeUsers: null, publishedPages: null, storageBytes: 2 * 1024 * 1024 * 1024 },
};

export interface TenantUsage {
  activeUsers: number;
  publishedPages: number;
  storageBytes: number;
}

export type QuotaCode = keyof TenantUsage;

export function evaluateQuotas(plan: PlanCode, usage: TenantUsage, storageOverrideBytes?: number) {
  const base = PLAN_QUOTAS[plan];
  const limits: PlanQuota = { ...base, storageBytes: storageOverrideBytes ?? base.storageBytes };
  return (Object.keys(usage) as QuotaCode[]).map((code) => {
    const limit = limits[code];
    const used = usage[code];
    return {
      code,
      used,
      limit,
      exceeded: limit !== null && used > limit,
      usageRatio: limit === null ? null : used / limit,
      enforcement: "SOFT" as const,
    };
  });
}
