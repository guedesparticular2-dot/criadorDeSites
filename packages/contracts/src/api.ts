import { z } from "zod";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  fieldErrors: z.record(z.array(z.string())).optional(),
});

export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({
  items: z.array(item),
  nextCursor: z.string().nullable(),
});
