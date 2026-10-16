/**
 * Operaciones sobre el orden de las piezas. ProjectState.order es la fuente de
 * verdad (invariante 7: es una permutación de los ids). Todas devuelven un
 * array nuevo: cada reordenación es una sola mutación y una entrada de deshacer.
 */
import type { QRRecord, RecordId } from "@/types";

import { compareNatural } from "./natural-sort";

export function moveTo(order: readonly RecordId[], id: RecordId, targetIndex: number): RecordId[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const next = order.filter((item) => item !== id);
  const index = Math.max(0, Math.min(next.length, Math.trunc(targetIndex)));
  next.splice(index, 0, id);
  return next;
}

export const moveToStart = (order: readonly RecordId[], id: RecordId) => moveTo(order, id, 0);
export const moveToEnd = (order: readonly RecordId[], id: RecordId) => moveTo(order, id, order.length);

/** Inserta ids nuevos tras `afterId` (o al final). */
export function insertAfter(order: readonly RecordId[], ids: readonly RecordId[], afterId?: RecordId): RecordId[] {
  const fresh = ids.filter((id) => !order.includes(id));
  const at = afterId === undefined ? -1 : order.indexOf(afterId);
  if (at < 0) return [...order, ...fresh];
  return [...order.slice(0, at + 1), ...fresh, ...order.slice(at + 1)];
}

export function removeIds(order: readonly RecordId[], ids: Iterable<RecordId>): RecordId[] {
  const remove = new Set(ids);
  return order.filter((id) => !remove.has(id));
}

export type SortKey = "area" | "estacion" | "mesa" | "sourceRow";

/** "Ordenar por…" (estable: a igualdad conserva el orden actual). */
export function sortOrder(order: readonly RecordId[], records: Readonly<Record<RecordId, QRRecord>>, key: SortKey): RecordId[] {
  const position = new Map(order.map((id, index) => [id, index]));
  return [...order].sort((a, b) => {
    const ra = records[a];
    const rb = records[b];
    let result = 0;
    if (ra && rb) {
      if (key === "sourceRow") {
        result = (ra.metadata.sourceRow ?? Number.MAX_SAFE_INTEGER) - (rb.metadata.sourceRow ?? Number.MAX_SAFE_INTEGER);
      } else {
        result = compareNatural(ra[key], rb[key]);
      }
    }
    return result !== 0 ? result : (position.get(a) ?? 0) - (position.get(b) ?? 0);
  });
}

/** Invariante 7: order es una permutación exacta de los ids. */
export function isPermutation(order: readonly RecordId[], ids: Iterable<RecordId>): boolean {
  const set = new Set(ids);
  return order.length === set.size && new Set(order).size === order.length && order.every((id) => set.has(id));
}

/** Repara el orden: quita ids desconocidos o repetidos y añade al final los que falten (por record.order). */
export function repairOrder(order: readonly RecordId[], records: Readonly<Record<RecordId, QRRecord>>): RecordId[] {
  const seen = new Set<RecordId>();
  const kept = order.filter((id) => {
    if (!(id in records) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const missing = Object.values(records)
    .filter((record) => !seen.has(record.id))
    .sort((a, b) => a.order - b.order)
    .map((record) => record.id);
  return [...kept, ...missing];
}

/** Materializa record.order desde el orden del proyecto (en las fronteras: exportar, guardar archivo). */
export function materializeOrder(order: readonly RecordId[], records: Readonly<Record<RecordId, QRRecord>>): QRRecord[] {
  return order.flatMap((id, index) => {
    const record = records[id];
    return record ? [{ ...record, order: index }] : [];
  });
}
