/**
 * Reglas del QR (spec §9, docs/ARCHITECTURE.md §S2 y §B.4). Funciones puras
 * compartidas por cliente y servidor.
 *
 * REGLA CRÍTICA: un registro con Link del QR (qr.source = 'existing') nunca
 * genera; un QR ya generado se reutiliza siempre, también al reabrir la app o
 * al volver a exportar. Solo un registro sin QR (source 'none') genera.
 */
import { ackValid } from "@/schemas/record";
import type { QrAck, QRRecord, QrResolution, QrStatus } from "@/types";

import { hasBlockingErrors } from "@/lib/validation/validate";

export { ackValid };

export type QrDecision =
  | "generate"
  | "reuse-generated"
  | "check-existing"
  | "blocked-stale"
  | "blocked-existing"
  | "none";

type QrSubject = Pick<QRRecord, "menuUrl" | "qr" | "qrAck" | "qrError" | "qrUrl">;

/** Qué hay que hacer con el QR de un registro. Solo 'generate' crea un QR nuevo. */
export function resolveQrDecision(record: QrSubject): QrDecision {
  const qr = record.qr;
  switch (qr.source) {
    case "none":
      // Defensa: un registro inconsistente con Link del QR nunca genera.
      return record.qrUrl === undefined ? "generate" : "check-existing";
    case "generated":
      return qr.payload === record.menuUrl || ackValid(record, "stale") ? "reuse-generated" : "blocked-stale";
    case "existing": {
      if (record.qrError || qr.verification === "unchecked" || !qr.snapshotKey || !qr.assetSha256) return "check-existing";
      const ok =
        qr.verification === "decoded"
          ? qr.decodedPayload === record.menuUrl || ackValid(record, "mismatch")
          : ackValid(record, "undecodable");
      return ok ? "none" : "blocked-existing";
    }
  }
}

/** Estado visible del QR, derivado de forma determinista. 'generating' solo existe en sesión. */
export function deriveQrStatus(record: QrSubject, inFlight = false): QrStatus {
  // Solo un registro sin QR puede estar generando; verificar un existente sigue siendo 'existing'.
  if (inFlight && record.qr.source === "none" && record.qrUrl === undefined) return "generating";
  if (record.qrError) return "error";
  switch (record.qr.source) {
    case "none":
      return "pending";
    case "generated":
      return record.qr.payload === record.menuUrl ? "generated" : "stale";
    case "existing":
      return "existing";
  }
}

/** Situaciones de bloqueo que el usuario debe resolver explícitamente (badge y diálogo de exportación). */
export type QrBlocker =
  | "pending"
  | "error"
  | "unverified"
  | "stale"
  | "existing-mismatch"
  | "existing-undecodable";

export function qrBlocker(record: QrSubject): QrBlocker | null {
  if (record.qrError) return "error";
  const decision = resolveQrDecision(record);
  switch (decision) {
    case "generate":
      return "pending";
    case "check-existing":
      return "unverified";
    case "blocked-stale":
      return "stale";
    case "blocked-existing":
      return record.qr.source === "existing" && record.qr.verification === "undecodable"
        ? "existing-undecodable"
        : "existing-mismatch";
    case "reuse-generated":
    case "none":
      return null;
  }
}

/** Invariante 5 (§C.3): exportable ⇔ QR resuelto y confirmado ∧ sin errores de validación ∧ sin qrError. */
export function isExportable(record: QRRecord): boolean {
  return !hasBlockingErrors(record.validationErrors) && qrBlocker(record) === null;
}

/** Ack ligado al menuUrl actual y a la huella del QR actual (otra edición lo invalida). */
export function makeAck(record: Pick<QRRecord, "menuUrl" | "qr">, kind: QrAck["kind"], at: string): QrAck | null {
  if (record.qr.source === "generated") return { kind, menuUrl: record.menuUrl, qrFingerprint: record.qr.payload, at };
  if (record.qr.source === "existing" && record.qr.assetSha256) {
    return { kind, menuUrl: record.menuUrl, qrFingerprint: record.qr.assetSha256, at };
  }
  return null;
}

/**
 * Guarda de aplicación (§S2.1): el cliente aplica una resolución SOLO si el
 * registro sigue como cuando se pidió. Así un resultado tardío no pisa un
 * Link del QR tecleado entretanto ni produce un 'stale' que el usuario no causó.
 */
export function canApplyResolution(
  current: Pick<QRRecord, "menuUrl" | "qr" | "qrUrl">,
  sent: { menuUrl: string; qrUrl?: string | undefined },
  resolution: QrResolution,
): boolean {
  switch (resolution.outcome) {
    case "failed":
      return current.menuUrl === sent.menuUrl && current.qrUrl === sent.qrUrl && current.qr.source !== "generated";
    case "existing-ok":
      return current.qr.source === "existing" && current.qrUrl !== undefined && current.qrUrl === sent.qrUrl && current.menuUrl === sent.menuUrl;
    case "generated":
    case "reused":
      return current.qr.source === "none" && current.qrUrl === undefined && current.menuUrl === resolution.qr.payload;
  }
}
