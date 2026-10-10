/**
 * Revisión de un ImportResult en el cliente (§S1.8-9). El servidor agrupa los
 * duplicados con la clave por defecto; aquí se recalculan con la clave del
 * proyecto (editable) y contra las piezas que ya existen, que solo el cliente conoce.
 */
import { applyDuplicateStrategy, findFileDuplicates, findProjectDuplicates, type DuplicateLink, type StrategyOutcome } from "@/lib/records/duplicates";
import type { DuplicateDecision, DuplicateGroup, DuplicateKeyConfig, DuplicateStrategy, ImportDisplayStats, ImportedRow, ImportResult, QRRecord, RejectedRow } from "@/types";

export interface ReviewModel {
  /** Todas las filas válidas (originales y duplicadas), por número de fila. */
  rows: ImportedRow[];
  fileGroups: DuplicateGroup[];
  projectGroups: DuplicateGroup[];
  stats: ImportDisplayStats;
}

export const validRows = (result: Pick<ImportResult, "successful" | "duplicateRows">): ImportedRow[] =>
  [...result.successful, ...result.duplicateRows].sort((a, b) => a.row - b.row);

/** `existing` vacío al reemplazar: nada del proyecto actual sobrevive, así que no hay duplicados contra él. */
export function reviewImport(result: ImportResult, config: DuplicateKeyConfig, existing: Iterable<QRRecord>): ReviewModel {
  const rows = validRows(result);
  const fileGroups = findFileDuplicates(rows, config);
  const projectGroups = findProjectDuplicates(rows, existing, config);

  const duplicateRows = new Set<number>();
  for (const group of fileGroups) for (const row of group.rows.slice(1)) duplicateRows.add(row);
  for (const group of projectGroups) for (const row of group.rows) duplicateRows.add(row);

  const withErrors = result.rejected.length;
  const duplicates = duplicateRows.size;
  return { rows, fileGroups, projectGroups, stats: { totalRows: result.totalRows, valid: result.totalRows - withErrors - duplicates, withErrors, duplicates } };
}

export interface ImportSelection {
  strategy: DuplicateStrategy;
  decisions: Record<number, DuplicateDecision>;
  /** Crear también las filas con error como piezas a corregir. */
  includeRejected: boolean;
}

export interface ImportPlan extends StrategyOutcome {
  /** Filas con error que se crean como «piezas a corregir» (vacío si la persona no lo pidió). */
  fixes: RejectedRow[];
}

export function planImport(result: ImportResult, review: ReviewModel, selection: ImportSelection): ImportPlan {
  const outcome = applyDuplicateStrategy(selection.strategy, review.rows, review.fileGroups, review.projectGroups, selection.decisions);
  return { ...outcome, fixes: selection.includeRejected ? [...result.rejected].sort((a, b) => a.row - b.row) : [] };
}

export const planSize = (plan: ImportPlan): number => plan.toCreate.length + plan.fixes.length;

export type { DuplicateLink };
