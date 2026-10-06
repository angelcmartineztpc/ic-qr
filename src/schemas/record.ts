import { z } from "zod";

import { normalizeText } from "@/lib/text/normalize";

import { ExistingQrUrlSchema, GeneratedQrUrlSchema, MenuUrlSchema, SafeHttpUrlSchema } from "./url";

const IsoDate = z.iso.datetime({ offset: true });
export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const FIELD_KEYS = ["area", "estacion", "mesa", "subgrupo", "concepto", "menuUrl", "qrUrl"] as const;
export const FieldKeySchema = z.enum(FIELD_KEYS);
export const BINDABLE_FIELDS = ["area", "estacion", "mesa", "subgrupo", "concepto", "menuUrl"] as const;
export const BindableFieldSchema = z.enum(BINDABLE_FIELDS);
export const TEXT_FIELDS = ["area", "estacion", "mesa", "subgrupo", "concepto"] as const;

export const QrStatusSchema = z.enum(["pending", "generating", "existing", "generated", "stale", "error"]);
export const QrErrorCodeSchema = z.enum([
  "unreachable",
  "timeout",
  "not-an-image",
  "too-large",
  "unsafe-url",
  "host-not-allowed",
  "unsupported-type",
  "raster-only",
  "invalid-svg",
  "undecodable",
  "storage-failed",
  "encode-failed",
  "asset-changed",
  "identity-mismatch",
]);

export const GeneratedStorageKeySchema = z.string().regex(/^(?:[a-z0-9-]+\/)?qr\/v\d+\/[0-9a-f]{64}\.svg$/);
export const SnapshotKeySchema = z.string().regex(/^(?:[a-z0-9-]+\/)?qr\/ext\/v\d+\/[0-9a-f]{64}\.json$/);

/** Origen del QR de un registro (§C.1). "mismatch" no se guarda: se deriva de decodedPayload ≠ menuUrl. */
export const QrSourceInfoSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("none") }),
  z.strictObject({
    source: z.literal("generated"),
    storageKey: GeneratedStorageKeySchema,
    payload: z.string().min(1).max(2048),
    contentHash: Sha256Schema,
    svgSha256: Sha256Schema,
    rendererVersion: z.string().min(1),
    generatedAt: IsoDate,
  }),
  z.strictObject({
    source: z.literal("existing"),
    assetKind: z.enum(["unknown", "svg", "raster"]),
    verification: z.enum(["unchecked", "decoded", "undecodable"]),
    assetSha256: Sha256Schema.optional(),
    snapshotKey: SnapshotKeySchema.optional(),
    decodedPayload: z.string().max(4096).optional(),
    strokeBased: z.boolean().optional(),
    checkedAt: IsoDate.optional(),
  }),
]);

/** Confirmación ligada: válida solo mientras menuUrl y la huella del QR no cambien. */
export const QrAckSchema = z.strictObject({
  kind: z.enum(["stale", "mismatch", "undecodable"]),
  menuUrl: z.string(),
  /** generated → payload · existing → assetSha256 */
  qrFingerprint: z.string(),
  at: IsoDate,
});

export const SeveritySchema = z.enum(["error", "warning", "info"]);

export const ValidationIssueSchema = z.strictObject({
  field: z.enum([...FIELD_KEYS, "record"]),
  code: z.string().min(1),
  message: z.string().min(1),
  severity: SeveritySchema,
});

export const RecordMetadataSchema = z.strictObject({
  origin: z.enum(["manual", "excel", "duplicate", "project-file"]),
  sourceFile: z.string().max(255).optional(),
  sourceRow: z.number().int().positive().optional(),
  extra: z.record(z.string(), z.string().max(2048)).optional(),
  duplicateOf: z.string().max(64).optional(),
});

/**
 * Persistencia (IndexedDB, .qrproj.json): TOLERANTE. Solo forma y longitudes
 * máximas; nunca falla por reglas de negocio (esas van a validationErrors).
 */
const Loose = (max = 2048) => z.string().max(max);
export const StoredRecordSchema = z.strictObject({
  id: z.string().min(1).max(64),
  area: Loose(),
  estacion: Loose(),
  mesa: Loose(),
  subgrupo: Loose(),
  concepto: Loose(),
  menuUrl: Loose(4096),
  qrUrl: Loose(4096).optional(),
  qrStatus: QrStatusSchema,
  qr: QrSourceInfoSchema,
  qrError: z.strictObject({ code: QrErrorCodeSchema, message: z.string() }).optional(),
  qrAck: QrAckSchema.optional(),
  order: z.number().int().nonnegative(),
  validationErrors: z.array(ValidationIssueSchema),
  metadata: RecordMetadataSchema,
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

// ---------- Reglas ESTRICTAS por campo (formulario, Excel, re-validación, exportación) ----------

const emptyIfMissing = (value: unknown) => (value === undefined || value === null ? "" : value);

/** Longitudes máximas por campo (texto libre, decisión R1). */
export const FIELD_MAX_LENGTH = { area: 120, estacion: 120, mesa: 40, subgrupo: 120, concepto: 120 } as const;

const text = (max: number) => z.preprocess(emptyIfMissing, z.string().transform(normalizeText).pipe(z.string().max(max)));
const required = (max: number) => text(max).pipe(z.string().min(1));

/** Obligatorios: Área, Mesa y Link del menú (§1.2-28). El resto es texto libre opcional. */
export const FIELD_RULES = {
  area: required(FIELD_MAX_LENGTH.area),
  estacion: text(FIELD_MAX_LENGTH.estacion),
  mesa: required(FIELD_MAX_LENGTH.mesa),
  subgrupo: text(FIELD_MAX_LENGTH.subgrupo),
  concepto: text(FIELD_MAX_LENGTH.concepto),
  menuUrl: z.preprocess(emptyIfMissing, MenuUrlSchema),
} as const;

export const REQUIRED_FIELDS = ["area", "mesa", "menuUrl"] as const;

const optionalQrUrl = z.preprocess(
  (value) => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? undefined : value),
  ExistingQrUrlSchema.optional(),
);

/** Datos editables (formulario / fila de Excel). Un Link del QR presente nunca provoca generación. */
export const RecordDraftSchema = z.strictObject({ ...FIELD_RULES, qrUrl: optionalQrUrl });

// ---------- Exportación ----------

type AckSubject = {
  menuUrl: string;
  qr: z.output<typeof QrSourceInfoSchema>;
  qrAck?: z.output<typeof QrAckSchema> | undefined;
};

/** Ack válido (pura, compartida por cliente y servidor). */
export function ackValid(record: AckSubject, kind: z.output<typeof QrAckSchema>["kind"]): boolean {
  const ack = record.qrAck;
  if (!ack || ack.kind !== kind || ack.menuUrl !== record.menuUrl) return false;
  if (record.qr.source === "generated") return ack.qrFingerprint === record.qr.payload;
  if (record.qr.source === "existing") return ack.qrFingerprint === record.qr.assetSha256;
  return false;
}

/** Frontera /api/export: proyección mínima y estricta. El servidor no confía en el estado del cliente. */
export const ExportRecordSchema = z
  .strictObject({
    id: z.string().min(1).max(64),
    ...FIELD_RULES,
    qrUrl: z.string().max(2048),
    qr: QrSourceInfoSchema,
    qrAck: QrAckSchema.optional(),
  })
  .superRefine((record, ctx) => {
    const qr = record.qr;
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (qr.source === "none") {
      issue("qr", "QR no resuelto");
      return;
    }
    if (qr.source === "generated") {
      if (!GeneratedQrUrlSchema.safeParse(record.qrUrl).success) issue("qrUrl", "qrUrl generado inválido");
      if (qr.payload !== record.menuUrl && !ackValid(record, "stale")) issue("qr", "QR desactualizado (stale) sin confirmar");
      return;
    }
    if (!SafeHttpUrlSchema.safeParse(record.qrUrl).success) issue("qrUrl", "Link del QR inválido");
    if (!qr.snapshotKey || !qr.assetSha256 || qr.verification === "unchecked") issue("qr", "QR existente sin verificar");
    else if (qr.verification === "undecodable" && !ackValid(record, "undecodable")) issue("qr", "QR existente ilegible sin confirmar");
    else if (qr.verification === "decoded" && qr.decodedPayload !== record.menuUrl && !ackValid(record, "mismatch")) {
      issue("qr", "El QR existente apunta a otra URL");
    }
  });
