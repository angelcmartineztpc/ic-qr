import { z } from "zod";

import { sanitizeFileName } from "@/lib/export/file-name";

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
    .default({ textMode: "outlined", cutLine: false }),
  zipNaming: z.enum(["index", "index-area-mesa"]).default("index"),
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
