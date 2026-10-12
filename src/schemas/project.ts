import { z } from "zod";

import { ProjectLayoutSchema, TemplateIdSchema } from "./geometry";
import { DEFAULT_DUPLICATE_KEY, DuplicateKeyConfigSchema } from "./import";
import { PDFOptionsSchema } from "./pdf";
import { TemplateOverridesSchema } from "./template";

const IsoDate = z.iso.datetime({ offset: true });

export const PROJECT_SCHEMA_VERSION = 2;
export const PROJECT_FILE_FORMAT = "qr-production-project";
export const PROJECT_FILE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Opciones de exportación tal como se guardan: el nombre puede estar vacío
 * mientras el usuario no lo toque (se rellena con defaultFileName al descargar).
 */
export const StoredExportOptionsSchema = z.strictObject({
  fileName: z.string().max(200),
  formats: z.array(z.enum(["pdf", "svgZip"])).min(1),
  pdf: PDFOptionsSchema,
  svg: z.strictObject({ textMode: z.enum(["outlined", "live"]), cutLine: z.boolean() }),
  zipNaming: z.enum(["index", "index-area-mesa"]),
});

export const QuarantineEntrySchema = z.strictObject({
  raw: z.unknown(),
  reason: z.string().max(2000),
  at: IsoDate,
});

/**
 * Proyecto persistido (IndexedDB y .qrproj.json). Los registros se validan
 * uno a uno con StoredRecordSchema al hidratar (lib/records/hydrate.ts):
 * lo ilegible va a cuarentena y nunca se descarta el proyecto entero.
 */
export const PersistedProjectSchema = z.strictObject({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  projectId: z.string().min(1).max(64),
  name: z.string().max(200),
  recordsById: z.record(z.string(), z.unknown()),
  order: z.array(z.string()),
  quarantine: z.array(QuarantineEntrySchema).default([]),
  templateId: TemplateIdSchema,
  templateOverrides: TemplateOverridesSchema,
  layout: ProjectLayoutSchema,
  exportOptions: StoredExportOptionsSchema,
  fileNameTouched: z.boolean(),
  duplicateKey: DuplicateKeyConfigSchema.catch({ ...DEFAULT_DUPLICATE_KEY, fields: [...DEFAULT_DUPLICATE_KEY.fields] }),
  revision: z.number().int().nonnegative(),
  savedRevision: z.number().int().nonnegative(),
  lastLocalSaveAt: IsoDate.optional(),
});

/** Archivo "Guardar proyecto" (.qrproj.json). */
export const ProjectFileSchema = z.strictObject({
  format: z.literal(PROJECT_FILE_FORMAT),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  exportedAt: IsoDate,
  project: PersistedProjectSchema,
});
