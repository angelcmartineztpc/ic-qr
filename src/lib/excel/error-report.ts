/**
 * Informe de errores en CSV (§S1.9). Se genera en el cliente. Cada celda que
 * empieza por = + - @ (o tabulador / retorno) lleva un apóstrofo delante, para
 * que Excel no la ejecute como fórmula; UTF-8 con BOM para que abra con acentos.
 */
import { FIELD_LABELS } from "@/lib/validation/messages.es";
import type { FieldKey, ImportIssue, RejectedRow } from "@/types";

export const CSV_BOM = "﻿";
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export interface DiscardedDuplicate {
  row: number;
  values: Partial<Record<FieldKey, string>>;
  reason: string;
}

const COLUMNS: readonly FieldKey[] = ["area", "estacion", "mesa", "subgrupo", "concepto", "menuUrl", "qrUrl"];

/** Una línea por problema: Fila, Campo, Problema, Valor original y las columnas de la pieza. */
export function buildErrorReport(rejected: readonly RejectedRow[], discarded: readonly DiscardedDuplicate[] = []): string {
  const header = ["Fila", "Campo", "Problema", "Valor", ...COLUMNS.map((field) => FIELD_LABELS[field])];
  const lines: string[][] = [];
  const fields = (values: Partial<Record<FieldKey, string>>) => COLUMNS.map((field) => values[field] ?? "");
  const fieldName = (issue: ImportIssue) => (issue.field === "file" || issue.field === "column" || issue.field === "record" ? "" : FIELD_LABELS[issue.field]);

  for (const row of [...rejected].sort((a, b) => a.row - b.row)) {
    for (const issue of row.issues.filter((i) => i.severity === "error")) {
      lines.push([String(row.row), fieldName(issue), issue.label, issue.value ?? "", ...fields(row.raw)]);
    }
  }
  for (const item of [...discarded].sort((a, b) => a.row - b.row)) lines.push([String(item.row), "", item.reason, "", ...fields(item.values)]);

  return CSV_BOM + [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
