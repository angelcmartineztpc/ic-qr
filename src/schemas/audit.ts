import { z } from "zod";

export const AUDIT_MAX_BATCH = 50;

export const AuditValidateRequestSchema = z.strictObject({
  urls: z.array(z.string().max(2048)).min(1).max(AUDIT_MAX_BATCH),
});
