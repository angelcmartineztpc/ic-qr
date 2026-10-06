import { z } from "zod";

import { BindableFieldSchema, FieldKeySchema, SeveritySchema } from "./record";

export const IMPORT_ISSUE_CODES = [
  // archivo
  "FILE_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "NOT_A_ZIP", "ZIP_CORRUPT", "LEGACY_XLS_OR_ENCRYPTED", "MACRO_ENABLED",
  "TEMPLATE_FILE", "NOT_XLSX", "XLSB_UNSUPPORTED", "ZIP_BOMB", "ZIP_SIZE_MISMATCH", "ZIP_TOO_MANY_ENTRIES",
  "TOO_MANY_CELLS", "PARSE_TIMEOUT", "NO_SHEET_WITH_HEADERS",
  // columnas
  "MISSING_COLUMN", "AMBIGUOUS_COLUMN", "FUZZY_HEADER", "DUPLICATE_COLUMN", "UNMAPPED_COLUMN", "TOO_MANY_COLUMNS",
  // filas y celdas
  "TOO_MANY_ROWS", "ROWS_TRUNCATED_BY_USER", "EMPTY_ROW", "MERGED_CELLS_FILLED", "REQUIRED_EMPTY", "INVALID_URL",
  "HTTP_URL", "IDN_URL", "QR_DENSE", "QR_TOO_DENSE", "CELL_ERROR", "CELL_TOO_LONG", "DATE_CELL", "BOOLEAN_CELL",
  "FORMULA_NO_CACHED_VALUE", "HYPERLINK_TEXT_MISMATCH", "HYPERLINK_FORMULA_UNRESOLVED",
  "QR_URL_UNSAFE", "QR_URL_HOST_NOT_ALLOWED",
  // duplicados (siempre 'warning')
  "DUPLICATE_IN_FILE", "DUPLICATE_IN_PROJECT",
] as const;
export const ImportIssueCodeSchema = z.enum(IMPORT_ISSUE_CODES);

/** Spec §29: { row, field, value, message } + forma corta para la lista (§6). */
export const ImportIssueSchema = z.strictObject({
  /** Fila real de Excel (1-based); null = a nivel de archivo/columna. */
  row: z.number().int().positive().nullable(),
  column: z.string().regex(/^[A-Z]{1,3}$/).optional(),
  field: z.enum([...FieldKeySchema.options, "file", "column", "record"]),
  value: z.string().max(200).nullable(),
  /** Forma corta, sin número de fila: "Link del menú inválido". */
  label: z.string().min(1),
  /** Forma larga: "El link del menú no es una URL válida". */
  message: z.string().min(1),
  severity: SeveritySchema,
  code: ImportIssueCodeSchema,
  relatedRow: z.number().int().positive().optional(),
});

export const ColumnMappingSchema = z.strictObject({
  column: z.string().regex(/^[A-Z]{1,3}$/),
  header: z.string().max(500),
  field: FieldKeySchema.nullable(),
  match: z.enum(["exact", "fuzzy", "manual", "ambiguous", "none"]),
  candidates: z.array(FieldKeySchema).optional(),
});

const ExtraSchema = z.record(z.string(), z.string().max(2048));

export const RecordDraftOutputSchema = z.strictObject({
  area: z.string(),
  estacion: z.string(),
  mesa: z.string(),
  subgrupo: z.string(),
  concepto: z.string(),
  menuUrl: z.string(),
  qrUrl: z.string().optional(),
});

export const ImportedRowSchema = z.strictObject({
  row: z.number().int().positive(),
  draft: RecordDraftOutputSchema,
  extra: ExtraSchema,
  issues: z.array(ImportIssueSchema),
  duplicateKey: z.string(),
});

export const RejectedRowSchema = z.strictObject({
  row: z.number().int().positive(),
  raw: z.partialRecord(FieldKeySchema, z.string()),
  extra: ExtraSchema,
  issues: z.array(ImportIssueSchema).min(1),
});

export const DuplicateGroupSchema = z.strictObject({
  key: z.string(),
  scope: z.enum(["file", "project"]),
  /** Filas de Excel; con scope 'file', rows[0] es la original. */
  rows: z.array(z.number().int().positive()).min(1),
  existingRecordIds: z.array(z.string()),
});

export const DuplicateStrategySchema = z.enum(["keep", "remove", "review"]);
export const DuplicateDecisionSchema = z.enum(["keep", "discard"]);

/** Spec §7: por defecto coinciden los 6 campos; configurable por proyecto. */
export const DuplicateKeyConfigSchema = z.strictObject({
  fields: z.array(BindableFieldSchema).min(1),
  caseInsensitive: z.boolean(),
  canonicalUrl: z.boolean(),
});

export const DEFAULT_DUPLICATE_KEY = {
  fields: ["area", "estacion", "mesa", "subgrupo", "concepto", "menuUrl"],
  caseInsensitive: true,
  canonicalUrl: true,
} as const satisfies z.input<typeof DuplicateKeyConfigSchema>;

/** Spec §29: ImportResult { totalRows, successful, errors, duplicates, warnings } (+ detalle). */
export const ImportResultSchema = z.strictObject({
  fileName: z.string().max(255),
  sheetName: z.string().max(255),
  headerRow: z.number().int().positive(),
  mapping: z.array(ColumnMappingSchema),
  missingColumns: z.array(FieldKeySchema),
  totalRows: z.number().int().nonnegative(),
  successful: z.array(ImportedRowSchema),
  rejected: z.array(RejectedRowSchema),
  errors: z.array(ImportIssueSchema),
  warnings: z.array(ImportIssueSchema),
  duplicates: z.array(DuplicateGroupSchema),
  duplicateRows: z.array(ImportedRowSchema),
  stats: z.strictObject({
    valid: z.number().int().nonnegative(),
    withErrors: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    emptyRowsSkipped: z.number().int().nonnegative(),
    truncatedTo: z.number().int().positive().optional(),
  }),
});

export const ImportResponseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), result: ImportResultSchema }),
  z.strictObject({ ok: z.literal(false), issues: z.array(ImportIssueSchema).min(1) }),
]);
