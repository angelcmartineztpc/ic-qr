/**
 * Creación y mutación de registros. Toda mutación pasa por aquí para que el
 * estado del QR, los errores de validación y updatedAt se recalculen siempre.
 */
import { newRecordId } from "@/lib/ids";
import { validateRecord } from "@/lib/validation/validate";
import type { QrAck, QRRecord, QrResolution, RecordDraft, RecordMetadata } from "@/types";

import { ackValid, deriveQrStatus, makeAck } from "./qr-state";

const UNCHECKED_EXISTING: QRRecord["qr"] = { source: "existing", assetKind: "unknown", verification: "unchecked" };

/** Recalcula los campos derivados (qrStatus y validationErrors). */
export function withDerived(record: QRRecord): QRRecord {
  const next = { ...record, qrStatus: deriveQrStatus(record) };
  return { ...next, validationErrors: validateRecord(next) };
}

export interface CreateRecordOptions {
  now: string;
  order: number;
  origin: RecordMetadata["origin"];
  id?: string;
  sourceFile?: string;
  sourceRow?: number;
  extra?: Record<string, string>;
  duplicateOf?: string;
}

/** Nuevo registro. Con Link del QR → QR existente (nunca se genera); sin él → QR pendiente. */
export function createRecord(draft: RecordDraft, options: CreateRecordOptions): QRRecord {
  const metadata: RecordMetadata = {
    origin: options.origin,
    ...(options.sourceFile === undefined ? {} : { sourceFile: options.sourceFile }),
    ...(options.sourceRow === undefined ? {} : { sourceRow: options.sourceRow }),
    ...(options.extra === undefined || Object.keys(options.extra).length === 0 ? {} : { extra: options.extra }),
    ...(options.duplicateOf === undefined ? {} : { duplicateOf: options.duplicateOf }),
  };
  return withDerived({
    id: options.id ?? newRecordId(),
    area: draft.area,
    estacion: draft.estacion,
    mesa: draft.mesa,
    subgrupo: draft.subgrupo,
    concepto: draft.concepto,
    menuUrl: draft.menuUrl,
    ...(draft.qrUrl === undefined ? {} : { qrUrl: draft.qrUrl }),
    qrStatus: "pending",
    qr: draft.qrUrl === undefined ? { source: "none" } : UNCHECKED_EXISTING,
    order: options.order,
    validationErrors: [],
    metadata,
    createdAt: options.now,
    updatedAt: options.now,
  });
}

function withoutQrState(record: QRRecord): QRRecord {
  const { qrError: _error, qrAck: _ack, ...rest } = record;
  return rest;
}

function withoutQrUrl(record: QRRecord): QRRecord {
  const { qrUrl: _qrUrl, ...rest } = record;
  return rest;
}

/**
 * Aplica los datos del formulario. Transiciones del QR (§B.4):
 * - generado: se conserva aunque cambie el Link del menú (queda 'stale', nunca se regenera solo);
 * - el usuario escribe otro Link del QR → QR existente sin verificar;
 * - el usuario vacía el Link del QR de un existente → pendiente (la UI pide confirmación).
 */
export function updateRecordData(record: QRRecord, draft: RecordDraft, now: string): QRRecord {
  let next: QRRecord = {
    ...record,
    area: draft.area,
    estacion: draft.estacion,
    mesa: draft.mesa,
    subgrupo: draft.subgrupo,
    concepto: draft.concepto,
    menuUrl: draft.menuUrl,
    updatedAt: now,
  };

  const requested = draft.qrUrl;
  const keepGenerated = record.qr.source === "generated" && (requested === undefined || requested === record.qrUrl);
  if (!keepGenerated && requested !== record.qrUrl) {
    next = withoutQrState(withoutQrUrl(next));
    next = requested === undefined ? { ...next, qr: { source: "none" } } : { ...next, qrUrl: requested, qr: UNCHECKED_EXISTING };
  } else if (next.qr.source === "none" && next.menuUrl !== record.menuUrl) {
    // Un fallo de generación anterior no aplica a la URL nueva.
    next = withoutQrState(next);
  }

  if (next.qrAck && !ackValid(next, next.qrAck.kind)) {
    const { qrAck: _stale, ...rest } = next;
    next = rest;
  }
  return withDerived(next);
}

/** Aplica el resultado de /api/qr/resolve (el llamador ya comprobó canApplyResolution). */
export function applyQrResolution(record: QRRecord, resolution: QrResolution, now: string): QRRecord {
  switch (resolution.outcome) {
    case "generated":
    case "reused":
      return withDerived({ ...withoutQrState(record), qr: resolution.qr, qrUrl: resolution.qrUrl, updatedAt: now });
    case "existing-ok": {
      const { qrError: _error, ...rest } = record;
      const next: QRRecord = { ...rest, qr: resolution.qr, updatedAt: now };
      if (next.qrAck && !ackValid(next, next.qrAck.kind)) {
        const { qrAck: _ack, ...withoutAck } = next;
        return withDerived(withoutAck);
      }
      return withDerived(next);
    }
    case "failed":
      return withDerived({ ...record, qrError: resolution.error, updatedAt: now });
  }
}

/** "Regenerar QR" (acción explícita desde 'stale'): el archivo anterior se conserva en el storage. */
export function regenerateQr(record: QRRecord, now: string): QRRecord {
  if (record.qr.source !== "generated") return record;
  return withDerived({ ...withoutQrState(withoutQrUrl(record)), qr: { source: "none" }, updatedAt: now });
}

/** "Mantener QR anterior" / "Usar de todos modos": confirmación ligada al estado actual. */
export function acknowledgeQr(record: QRRecord, kind: QrAck["kind"], now: string): QRRecord {
  const ack = makeAck(record, kind, now);
  return ack ? withDerived({ ...record, qrAck: ack, updatedAt: now }) : record;
}

/** "Duplicar": misma información y mismo QR (direccionado por contenido: no se crea otro archivo). */
export function duplicateRecord(record: QRRecord, options: { now: string; order: number; id?: string }): QRRecord {
  const { qrAck: _ack, ...rest } = record;
  return withDerived({
    ...rest,
    id: options.id ?? newRecordId(),
    order: options.order,
    metadata: { origin: "duplicate", duplicateOf: record.id },
    createdAt: options.now,
    updatedAt: options.now,
  });
}

/** Valores para precargar el formulario de edición. */
export function draftOf(record: QRRecord): RecordDraft {
  return {
    area: record.area,
    estacion: record.estacion,
    mesa: record.mesa,
    subgrupo: record.subgrupo,
    concepto: record.concepto,
    menuUrl: record.menuUrl,
    ...(record.qrUrl === undefined ? {} : { qrUrl: record.qrUrl }),
  };
}
