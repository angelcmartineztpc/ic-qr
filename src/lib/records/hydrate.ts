/**
 * Hidratación tolerante (IndexedDB y .qrproj.json). Cada registro se valida
 * por separado: lo que no tiene forma va a cuarentena (visible y descargable),
 * lo que incumple reglas de negocio se carga con validationErrors.
 * Nunca se descarta un proyecto entero.
 */
import { StoredRecordSchema } from "@/schemas/record";
import type { QRRecord, QuarantineEntry, RecordId } from "@/types";

import { withDerived } from "./factory";
import { repairOrder } from "./order";

export interface HydratedRecords {
  recordsById: Record<RecordId, QRRecord>;
  order: RecordId[];
  quarantine: QuarantineEntry[];
}

export function hydrateRecords(rawById: Readonly<Record<string, unknown>>, order: readonly string[], now: string): HydratedRecords {
  const recordsById: Record<RecordId, QRRecord> = {};
  const quarantine: QuarantineEntry[] = [];

  for (const [key, raw] of Object.entries(rawById)) {
    const parsed = StoredRecordSchema.safeParse(raw);
    if (!parsed.success) {
      const reason = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(registro)"}: ${issue.message}`)
        .join("; ");
      quarantine.push({ raw, reason, at: now });
      continue;
    }
    if (parsed.data.id !== key || recordsById[key]) {
      quarantine.push({ raw, reason: `Id inconsistente o repetido (${key})`, at: now });
      continue;
    }
    // Invariante 9: 'generating' nunca se restaura; el estado y los errores se re-derivan.
    recordsById[key] = withDerived(parsed.data);
  }

  return { recordsById, order: repairOrder(order, recordsById), quarantine };
}

/** Al abrir un .qrproj.json se borran todos los acks (§1.2-4) y se informa qué piezas quedaron afectadas. */
export function stripAcks(recordsById: Readonly<Record<RecordId, QRRecord>>): { recordsById: Record<RecordId, QRRecord>; affected: RecordId[] } {
  const affected: RecordId[] = [];
  const next: Record<RecordId, QRRecord> = {};
  for (const [id, record] of Object.entries(recordsById)) {
    if (record.qrAck) {
      const { qrAck: _ack, ...rest } = record;
      next[id] = withDerived(rest);
      affected.push(id);
    } else {
      next[id] = record;
    }
  }
  return { recordsById: next, affected };
}
