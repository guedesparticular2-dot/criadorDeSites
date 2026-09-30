import { z } from "zod";

export const tenantContextSchema = z.object({
  tenantId: z.string().uuid(),
  hostname: z.string().min(1),
  actorUserId: z.string().uuid().optional(),
  requestId: z.string().min(8),
});

export const registrationRequestSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
  birthDate: z.coerce.date(),
  relationshipText: z.string().trim().min(2).max(300),
  termsVersion: z.string().min(1),
  guardian: z.object({ name: z.string().min(3), email: z.string().email() }).optional(),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;
