/**
 * Detección de duplicados (spec §7, docs/ARCHITECTURE.md §1.2-10 y §S1.8).
 * La clave es configurable; nunca se elimina nada en silencio: las
 * estrategias devuelven siempre qué se crea y qué se descarta.
 */
import { comparableText, normalizeText } from "@/lib/text/normalize";
import { urlDedupKey } from "@/lib/validation/url";
import type {
  BindableField,
  DuplicateDecision,
  DuplicateGroup,
  DuplicateKeyConfig,
  DuplicateStrategy,
  ImportDisplayStats,
  ImportedRow,
  ImportResult,
  QRRecord,
  RecordDraft,
} from "@/types";

type KeySource = Pick<RecordDraft, BindableField>;

const SEPARATOR = "␟"; // ␟ no aparece en texto normalizado de usuario

export function duplicateKey(source: KeySource, config: DuplicateKeyConfig): string {
  return config.fields
    .map((field) => {
      const value = source[field];
      if (field === "menuUrl" && config.canonicalUrl) return urlDedupKey(value);
      return config.caseInsensitive ? comparableText(value) : normalizeText(value);
    })
    .join(SEPARATOR);
}

/** Grupos dentro del archivo: la primera aparición es la original (rows[0]). */
export function findFileDuplicates(rows: ReadonlyArray<{ row: number; draft: KeySource }>, config: DuplicateKeyConfig): DuplicateGroup[] {
  const byKey = new Map<string, number[]>();
  for (const { row, draft } of rows) {
    const key = duplicateKey(draft, config);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }
  return [...byKey.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, scope: "file" as const, rows: [...list].sort((a, b) => a - b), existingRecordIds: [] }));
}

/** Filas que ya existen en el proyecto (lo calcula el cliente, que es quien tiene el proyecto). */
export function findProjectDuplicates(
  rows: ReadonlyArray<{ row: number; draft: KeySource }>,
  existing: Iterable<QRRecord>,
  config: DuplicateKeyConfig,
): DuplicateGroup[] {
  const existingByKey = new Map<string, string[]>();
  for (const record of existing) {
    const key = duplicateKey(record, config);
    const list = existingByKey.get(key);
    if (list) list.push(record.id);
    else existingByKey.set(key, [record.id]);
  }
  const groups = new Map<string, DuplicateGroup>();
  for (const { row, draft } of rows) {
    const key = duplicateKey(draft, config);
    const ids = existingByKey.get(key);
    if (!ids) continue;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, scope: "project", rows: [row], existingRecordIds: ids });
  }
  return [...groups.values()];
}

/** Alta manual: aviso no bloqueante si ya hay una pieza igual (la acción Duplicar queda exenta). */
export function findExistingDuplicate(draft: KeySource, records: Iterable<QRRecord>, config: DuplicateKeyConfig, ignoreId?: string): QRRecord | null {
  const key = duplicateKey(draft, config);
  for (const record of records) {
    if (record.id !== ignoreId && duplicateKey(record, config) === key) return record;
  }
  return null;
}

export type DuplicateLink = { kind: "row"; row: number } | { kind: "record"; recordId: string };

export interface StrategyOutcome {
  toCreate: Array<{ row: ImportedRow; duplicateOf?: DuplicateLink }>;
  discarded: Array<{ row: ImportedRow; duplicateOf: DuplicateLink }>;
}

interface DuplicateRole {
  /** Original del archivo o registro existente al que duplica. */
  link: DuplicateLink | null;
  /** Es la primera de su grupo de archivo y no duplica al proyecto. */
  original: boolean;
}

function roles(rows: readonly ImportedRow[], fileGroups: readonly DuplicateGroup[], projectGroups: readonly DuplicateGroup[]) {
  const map = new Map<number, DuplicateRole>(rows.map((r) => [r.row, { link: null, original: true }]));
  for (const group of fileGroups) {
    const [first, ...rest] = group.rows;
    if (first === undefined) continue;
    for (const row of rest) map.set(row, { link: { kind: "row", row: first }, original: false });
  }
  for (const group of projectGroups) {
    const recordId = group.existingRecordIds[0];
    if (recordId === undefined) continue;
    // El duplicado contra el proyecto tiene prioridad: la "original" es la pieza existente.
    for (const row of group.rows) map.set(row, { link: { kind: "record", recordId }, original: false });
  }
  return map;
}

/** Decisión por defecto en "Revisar manualmente": se conserva la original y se descartan las copias. */
export function defaultReviewDecisions(
  rows: readonly ImportedRow[],
  fileGroups: readonly DuplicateGroup[],
  projectGroups: readonly DuplicateGroup[],
): Record<number, DuplicateDecision> {
  const decisions: Record<number, DuplicateDecision> = {};
  for (const [row, role] of roles(rows, fileGroups, projectGroups)) {
    if (role.link) decisions[row] = "discard";
  }
  return decisions;
}

/** Spec §7: Mantener / Eliminar duplicados / Revisar manualmente. */
export function applyDuplicateStrategy(
  strategy: DuplicateStrategy,
  rows: readonly ImportedRow[],
  fileGroups: readonly DuplicateGroup[],
  projectGroups: readonly DuplicateGroup[],
  decisions: Readonly<Record<number, DuplicateDecision>> = {},
): StrategyOutcome {
  const roleOf = roles(rows, fileGroups, projectGroups);
  const outcome: StrategyOutcome = { toCreate: [], discarded: [] };
  for (const row of [...rows].sort((a, b) => a.row - b.row)) {
    const link = roleOf.get(row.row)?.link ?? null;
    if (!link) {
      outcome.toCreate.push({ row });
      continue;
    }
    const keep = strategy === "keep" || (strategy === "review" && (decisions[row.row] ?? "discard") === "keep");
    if (keep) outcome.toCreate.push({ row, duplicateOf: link });
    else outcome.discarded.push({ row, duplicateOf: link });
  }
  return outcome;
}

/**
 * Números del resumen (§6). Una fila válida que duplica al proyecto pasa de
 * "válidas" a "duplicadas"; nunca se cuenta dos veces.
 * Invariante: totalRows === valid + withErrors + duplicates.
 */
export function importDisplayStats(result: Pick<ImportResult, "totalRows" | "stats" | "duplicateRows">, projectGroups: readonly DuplicateGroup[]): ImportDisplayStats {
  const duplicateRows = new Set(result.duplicateRows.map((r) => r.row));
  for (const group of projectGroups) for (const row of group.rows) duplicateRows.add(row);
  const withErrors = result.stats.withErrors;
  const duplicates = duplicateRows.size;
  return { totalRows: result.totalRows, valid: result.totalRows - withErrors - duplicates, withErrors, duplicates };
}
