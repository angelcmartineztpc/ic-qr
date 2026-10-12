import { isExportable, qrBlocker } from "@/lib/records/qr-state";
import { hasBlockingErrors } from "@/lib/validation/validate";
import type { QRRecord, RecordId } from "@/types";

/** Contadores siempre visibles (spec §37): cuántas piezas hay, cuáles tienen QR, cuáles lo necesitan. */
export interface RecordCounts {
  total: number;
  withErrors: number;
  /** QR listo (generado o existente verificado). */
  withQr: number;
  /** Necesitan atención: pendiente, error, desactualizado sin confirmar, sin verificar o discrepante. */
  needQr: number;
  /** Con QR generado ya reutilizable. */
  generated: number;
  existing: number;
  exportable: number;
  excluded: number;
}

export type CounterFilter = "all" | "errors" | "withQr" | "needQr" | "excluded";

export function countRecords(records: readonly QRRecord[], excluded: ReadonlySet<RecordId> = new Set()): RecordCounts {
  const counts: RecordCounts = { total: records.length, withErrors: 0, withQr: 0, needQr: 0, generated: 0, existing: 0, exportable: 0, excluded: 0 };
  for (const record of records) {
    if (hasBlockingErrors(record.validationErrors)) counts.withErrors++;
    const blocker = qrBlocker(record);
    if (blocker === null) {
      counts.withQr++;
      if (record.qr.source === "generated") counts.generated++;
      else counts.existing++;
    } else {
      counts.needQr++;
    }
    if (isExportable(record)) counts.exportable++;
    if (excluded.has(record.id)) counts.excluded++;
  }
  return counts;
}

export function matchesFilter(record: QRRecord, filter: CounterFilter, excluded: ReadonlySet<RecordId> = new Set()): boolean {
  switch (filter) {
    case "all":
      return true;
    case "errors":
      return hasBlockingErrors(record.validationErrors);
    case "withQr":
      return qrBlocker(record) === null;
    case "needQr":
      return qrBlocker(record) !== null;
    case "excluded":
      return excluded.has(record.id);
  }
}

/** Búsqueda simple sobre los campos visibles (sin distinguir mayúsculas ni acentos). */
export function matchesQuery(record: QRRecord, query: string): boolean {
  const q = normalize(query);
  if (q === "") return true;
  return [record.area, record.estacion, record.mesa, record.subgrupo, record.concepto, record.menuUrl].some((value) => normalize(value).includes(q));
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function paginate<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pages };
}
