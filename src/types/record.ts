import type { z } from "zod";

import type {
  QrAckSchema,
  QrErrorCodeSchema,
  QrSourceInfoSchema,
  QrStatusSchema,
  RecordDraftSchema,
  RecordMetadataSchema,
  StoredRecordSchema,
  ValidationIssueSchema,
} from "@/schemas/record";

export type QrStatus = z.output<typeof QrStatusSchema>;
export type QrErrorCode = z.output<typeof QrErrorCodeSchema>;
export type QrSourceInfo = z.output<typeof QrSourceInfoSchema>;
export type GeneratedQrSource = Extract<QrSourceInfo, { source: "generated" }>;
export type ExistingQrSource = Extract<QrSourceInfo, { source: "existing" }>;
export type QrAck = z.output<typeof QrAckSchema>;
export type ValidationIssue = z.output<typeof ValidationIssueSchema>;
export type RecordMetadata = z.output<typeof RecordMetadataSchema>;
/** Spec §8, ampliado: estado del QR, errores de validación y metadatos. */
export type QRRecord = z.output<typeof StoredRecordSchema>;
/** Datos editables tras validación estricta (formulario / fila de Excel). */
export type RecordDraft = z.output<typeof RecordDraftSchema>;
/** Lo que llega del formulario o del Excel antes de validar. */
export type RecordDraftInput = Partial<Record<keyof RecordDraft, string | null | undefined>>;
