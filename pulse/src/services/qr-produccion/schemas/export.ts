import { z } from "zod";

import { sanitizeFileName } from "@/services/qr-produccion/export/file-name";

import { ProjectLayoutSchema, TemplateIdSchema } from "./geometry";
import { PDFOptionsSchema } from "./pdf";
import { ExportRecordSchema } from "./record";
import { TemplateOverridesSchema } from "./template";

export const FileNameSchema = z
  .string()
  .max(200)
  .transform(sanitizeFileName)
  .pipe(z.string().min(1, { error: "Nombre de archivo vacío" }));

export const ExportOptionsSchema = z.strictObject({
  fileName: FileNameSchema,
  formats: z.array(z.enum(["pdf", "svgZip"])).min(1).default(["pdf"]),
  pdf: PDFOptionsSchema,
  svg: z
    .strictObject({ textMode: z.enum(["outlined", "live"]), cutLine: z.boolean() })
    .default({ textMode: "live", cutLine: false }),
  zipNaming: z.enum(["index", "index-area-mesa"]).default("index"),
  /** Un PDF por Estación (en el orden del Excel), empaquetados en un ZIP. */
  pdfBySection: z.boolean().default(false),
  /**
   * Exportación por lotes (techo de CPU de las Edge Functions): esta llamada es una parte de `total` piezas que empieza
   * en `offset`. Solo cambia la numeración de los SVG del ZIP (001.svg… sobre el total), para que las partes encajen.
   */
  batch: z.strictObject({ offset: z.number().int().nonnegative(), total: z.number().int().positive() }).optional(),
});

export const EXPORT_MAX_RECORDS = 5000;

export const ExportRequestSchema = z
  .strictObject({
    records: z.array(ExportRecordSchema).min(1).max(EXPORT_MAX_RECORDS),
    templateId: TemplateIdSchema,
    templateOverrides: TemplateOverridesSchema,
    layout: ProjectLayoutSchema,
    options: ExportOptionsSchema,
  })
  .refine((request) => request.layout.templateId === request.templateId, {
    error: "templateId y layout.templateId no coinciden",
    path: ["layout", "templateId"],
  })
  .refine((request) => new Set(request.records.map((r) => r.id)).size === request.records.length, {
    error: "Hay registros repetidos en la exportación",
    path: ["records"],
  });

export type ExportRequest = z.output<typeof ExportRequestSchema>;
export type ExportRequestInput = z.input<typeof ExportRequestSchema>;
