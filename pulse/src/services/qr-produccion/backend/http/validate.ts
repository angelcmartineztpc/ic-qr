import type { ZodType } from "zod";

import { HttpError } from "./errors";

/** Valida con un schema de zod; si falla, 400 con las primeras incidencias (ruta + mensaje). */
export function parseBody<T>(schema: ZodType<T>, raw: unknown, message: string, maxIssues = 10): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new HttpError(
    400,
    "VALIDATION_FAILED",
    message,
    parsed.error.issues.slice(0, maxIssues).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}
