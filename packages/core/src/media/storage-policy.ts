export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;

export function canAcceptUpload(input: { mimeType: string; byteSize: number; diskUsedPercent: number }) {
  if (input.diskUsedPercent >= 80) return { allowed: false, reason: "DISK_HEADROOM" as const };
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { allowed: false, reason: "UNSUPPORTED_MEDIA_TYPE" as const };
  }
  if (input.byteSize > MAX_ORIGINAL_BYTES) return { allowed: false, reason: "FILE_TOO_LARGE" as const };
  return { allowed: true, reason: null };
}

export function canDiscardOriginal(requiredVariants: string[], completedVariants: string[]) {
  const completed = new Set(completedVariants);
  return requiredVariants.length > 0 && requiredVariants.every((variant) => completed.has(variant));
}
