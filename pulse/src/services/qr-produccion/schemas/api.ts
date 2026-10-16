import { z } from "zod";

import { FieldKeySchema, QrErrorCodeSchema, QrSourceInfoSchema } from "./record";

/**
 * POST /api/qr/resolve. Los ítems de generación NO admiten qrUrl ni qr: se
 * validan uno a uno en el servidor y un ítem que los traiga falla con
 * unsafe-url sin generar (defensa en profundidad de la regla crítica).
 */
export const QR_RESOLVE_MAX_BATCH = 100;

export const QrResolveItemSchema = z.strictObject({
  recordId: z.string().min(1).max(64),
  menuUrl: z.string().max(4096),
  expectedRevision: z.number().int().nonnegative(),
});

export const QrVerifyItemSchema = z.strictObject({
  recordId: z.string().min(1).max(64),
  qrUrl: z.string().max(4096),
  menuUrl: z.string().max(4096),
});

export const QrResolveRequestSchema = z
  .strictObject({
    items: z.array(z.unknown()).max(QR_RESOLVE_MAX_BATCH).default([]),
    verify: z.array(QrVerifyItemSchema).max(QR_RESOLVE_MAX_BATCH).default([]),
  })
  .refine((request) => request.items.length + request.verify.length > 0, { error: "La petición está vacía" });

const GeneratedSourceSchema = QrSourceInfoSchema.options[1];
const ExistingSourceSchema = QrSourceInfoSchema.options[2];

export const QrResolutionSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    recordId: z.string(),
    outcome: z.enum(["generated", "reused"]),
    qrUrl: z.string(),
    qr: GeneratedSourceSchema,
  }),
  z.strictObject({ recordId: z.string(), outcome: z.literal("existing-ok"), qr: ExistingSourceSchema }),
  z.strictObject({
    recordId: z.string(),
    outcome: z.literal("failed"),
    error: z.strictObject({ code: QrErrorCodeSchema, message: z.string() }),
  }),
]);

export const QrResolveResponseSchema = z.strictObject({
  results: z.array(QrResolutionSchema),
  created: z.number().int().nonnegative(),
  reused: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

/** Cabecera X-Column-Mapping: base64url(JSON) ≤ 8 KB con el mapeo manual de columnas. */
export const COLUMN_MAPPING_HEADER_MAX = 8 * 1024;

export const ColumnMappingEntriesSchema = z
  .array(z.strictObject({ column: z.string().regex(/^[A-Z]{1,3}$/), field: FieldKeySchema.nullable() }))
  .max(100);

export function encodeColumnMappingHeader(entries: z.input<typeof ColumnMappingEntriesSchema>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const ColumnMappingHeaderSchema = z
  .string()
  .max(COLUMN_MAPPING_HEADER_MAX)
  .regex(/^[A-Za-z0-9_-]*$/, { error: "Codificación base64url inválida" })
  .transform((value, ctx) => {
    try {
      const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "X-Column-Mapping no es JSON válido" });
      return z.NEVER;
    }
  })
  .pipe(ColumnMappingEntriesSchema);
