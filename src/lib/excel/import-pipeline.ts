/**
 * Filas crudas → ImportResult (docs/ARCHITECTURE.md §S1.5-8). Código puro:
 * no conoce SheetJS ni el servidor, así que se prueba con matrices de celdas.
 * Regla: ninguna fila desaparece; toda fila no vacía está en `successful`,
 * `rejected` o `duplicateRows`.
 */
import { duplicateKey, findFileDuplicates } from "@/lib/records/duplicates";
import { normalizeText } from "@/lib/text/normalize";
import { importIssueFromCheck, duplicateInFileIssue } from "@/lib/validation/import-issues";
import { FIELD_LABELS } from "@/lib/validation/messages.es";
import { validateDraft } from "@/lib/validation/validate";
import { DEFAULT_DUPLICATE_KEY } from "@/schemas/import";
import { FIELD_KEYS, REQUIRED_FIELDS } from "@/schemas/record";
import type { ColumnMapping, DuplicateKeyConfig, FieldKey, ImportedRow, ImportIssue, ImportIssueCode, ImportResult, RecordDraft, RejectedRow } from "@/types";

import { fileIssue } from "./file-issues";
import { coerceCell, type CellNote } from "./coerce";
import { columnLetter, type RawCell, type RawSheet } from "./types";

export const MAX_COLUMNS = 50;
export const MAX_EXTRA_LENGTH = 2048;

export interface PipelineInput {
  fileName: string;
  sheet: RawSheet;
  /** Índice 0-based de la fila de cabecera. */
  headerRowIndex: number;
  mapping: ColumnMapping[];
  maxRows: number;
  /** El usuario aceptó importar solo las primeras N filas. */
  truncateTo?: number | undefined;
  duplicateKey?: DuplicateKeyConfig;
  /** Política de hosts para «Link del QR»: devuelve false si el host no está permitido. */
  isQrHostAllowed?: ((host: string) => boolean) | undefined;
}

export type PipelineOutput = { ok: true; result: ImportResult } | { ok: false; issues: ImportIssue[] };

const REQUIRED = new Set<FieldKey>(REQUIRED_FIELDS);

const NOTE_TEXT: Partial<Record<ImportIssueCode, (note: CellNote, field: FieldKey) => { label: string; message: string }>> = {
  CELL_ERROR: (n, f) => ({ label: `${FIELD_LABELS[f]} con error de Excel`, message: `La celda de ${FIELD_LABELS[f]} tiene un error de Excel (${n.detail ?? "#ERROR"})` }),
  DATE_CELL: (n, f) => ({ label: `${FIELD_LABELS[f]} era una fecha`, message: `La celda de ${FIELD_LABELS[f]} es una fecha (${n.detail ?? ""}); se importó como texto. Si no es lo que esperabas, formatea la columna como texto en Excel` }),
  BOOLEAN_CELL: (_n, f) => ({ label: `${FIELD_LABELS[f]} era VERDADERO/FALSO`, message: `La celda de ${FIELD_LABELS[f]} es un valor lógico; se importó como texto` }),
  FORMULA_NO_CACHED_VALUE: (_n, f) => ({ label: `${FIELD_LABELS[f]}: fórmula sin valor`, message: `La fórmula de ${FIELD_LABELS[f]} no tiene un valor guardado; ábrela y guárdala en Excel` }),
  HYPERLINK_TEXT_MISMATCH: (n, f) => ({ label: `${FIELD_LABELS[f]}: el texto no coincide con el enlace`, message: `El texto visible de ${FIELD_LABELS[f]} (${n.detail ?? ""}) no es el destino real del enlace; se usó el destino` }),
  HYPERLINK_FORMULA_UNRESOLVED: (_n, f) => ({ label: `${FIELD_LABELS[f]}: HYPERLINK con referencias`, message: `La fórmula HYPERLINK de ${FIELD_LABELS[f]} usa referencias y no se pudo leer su destino; se usó el valor mostrado` }),
};

const truncate200 = (value: string) => (value.length > 200 ? `${value.slice(0, 199)}…` : value);

function noteIssue(row: number, column: string, field: FieldKey, note: CellNote): ImportIssue {
  const text = NOTE_TEXT[note.code]?.(note, field) ?? { label: `${FIELD_LABELS[field]}: aviso`, message: `Aviso en ${FIELD_LABELS[field]}` };
  return { row, column, field, value: note.detail ? truncate200(note.detail) : null, label: text.label, message: text.message, severity: note.severity, code: note.code };
}

/** Relleno de celdas combinadas en filas de datos (la cabecera se deja como está). */
export function fillMerges(sheet: RawSheet, headerRowIndex: number): { rows: Array<Array<RawCell | null>>; issues: ImportIssue[] } {
  const rows = sheet.rows.map((row) => [...row]);
  const issues: ImportIssue[] = [];
  for (const [r0, c0, r1, c1] of sheet.merges) {
    if (r0 <= headerRowIndex) continue;
    const source = rows[r0]?.[c0];
    if (!source || (r0 === r1 && c0 === c1)) continue;
    for (let r = r0; r <= r1; r++) {
      const row = (rows[r] ??= []);
      for (let c = c0; c <= c1; c++) {
        if (r === r0 && c === c0) continue;
        while (row.length <= c) row.push(null);
        row[c] = source;
      }
    }
    const range = `${columnLetter(c0)}${r0 + 1}:${columnLetter(c1)}${r1 + 1}`;
    issues.push({ row: r0 + 1, column: columnLetter(c0), field: "column", value: range, label: `Celdas combinadas rellenadas (${range})`, message: `El rango ${range} tiene celdas combinadas; el valor se copió a todas las filas del rango`, severity: "warning", code: "MERGED_CELLS_FILLED" });
  }
  return { rows, issues };
}

const columnIndex = (letter: string) => [...letter].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

export function missingRequiredColumns(mapping: readonly ColumnMapping[]): FieldKey[] {
  const mapped = new Set(mapping.flatMap((m) => (m.field ? [m.field] : [])));
  return REQUIRED_FIELDS.filter((field) => !mapped.has(field));
}

/** ¿Hace falta que la persona confirme el mapeo de columnas antes de importar? */
export const needsColumnMapping = (mapping: readonly ColumnMapping[]): boolean =>
  missingRequiredColumns(mapping).length > 0 || mapping.some((m) => m.match === "ambiguous");

export function columnIssues(mapping: readonly ColumnMapping[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const mapped = new Set(mapping.flatMap((m) => (m.field ? [m.field] : [])));
  for (const field of FIELD_KEYS) {
    if (mapped.has(field)) continue;
    issues.push({ row: null, field, value: null, label: `Falta la columna ${FIELD_LABELS[field]}`, message: REQUIRED.has(field) ? `No se encontró la columna ${FIELD_LABELS[field]}, que es obligatoria` : `No se encontró la columna ${FIELD_LABELS[field]}; las piezas quedarán con ese dato vacío`, severity: REQUIRED.has(field) ? "error" : "warning", code: "MISSING_COLUMN" });
  }
  for (const m of mapping) {
    if (m.match === "fuzzy" && m.field) issues.push({ row: null, column: m.column, field: m.field, value: m.header, label: `Columna «${m.header}» interpretada como ${FIELD_LABELS[m.field]}`, message: `La columna ${m.column} («${m.header}») se interpretó como ${FIELD_LABELS[m.field]}. Revisa que sea correcto`, severity: "warning", code: "FUZZY_HEADER" });
    else if (m.match === "ambiguous") issues.push({ row: null, column: m.column, field: "column", value: m.header, label: `Columna «${m.header}» ambigua`, message: `No se pudo decidir a qué campo corresponde la columna ${m.column} («${m.header}»)`, severity: "warning", code: m.candidates?.length === 1 ? "DUPLICATE_COLUMN" : "AMBIGUOUS_COLUMN" });
    else if (m.field === null) issues.push({ row: null, column: m.column, field: "column", value: m.header, label: `Columna «${m.header}» no importada`, message: `La columna ${m.column} («${m.header}») no es un campo de la pieza; sus datos se conservan como información extra`, severity: "info", code: "UNMAPPED_COLUMN" });
  }
  return issues;
}

const isBlank = (cell: RawCell | null | undefined) => !cell || ((cell.v === undefined || String(cell.v).trim() === "") && cell.l === undefined);

export function buildImportResult(input: PipelineInput): PipelineOutput {
  const { sheet, headerRowIndex, mapping } = input;
  const config = input.duplicateKey ?? DEFAULT_DUPLICATE_KEY;
  if (mapping.length > MAX_COLUMNS) return { ok: false, issues: [fileIssue("TOO_MANY_COLUMNS")] };

  const base = { fileName: input.fileName, sheetName: sheet.name, headerRow: headerRowIndex + 1, mapping, missingColumns: missingRequiredColumns(mapping) };
  const emptyStats = { valid: 0, withErrors: 0, duplicates: 0, emptyRowsSkipped: 0 };
  const fileLevel = columnIssues(mapping);

  // Sin las columnas obligatorias (o con columnas ambiguas) no se procesa nada: la persona decide el mapeo.
  if (needsColumnMapping(mapping)) {
    return { ok: true, result: { ...base, totalRows: 0, successful: [], rejected: [], errors: fileLevel.filter((i) => i.severity === "error"), warnings: fileLevel.filter((i) => i.severity !== "error"), duplicates: [], duplicateRows: [], stats: emptyStats } };
  }

  const { rows, issues: mergeIssues } = fillMerges(sheet, headerRowIndex);
  const byField = new Map<FieldKey, string>(mapping.flatMap((m): Array<[FieldKey, string]> => (m.field ? [[m.field, m.column]] : [])));
  const extraColumns = mapping.filter((m) => m.field === null && m.match !== "ambiguous" && m.header !== "");

  // Filas de datos no vacías, con su número real de Excel.
  const dataRows: Array<{ row: number; cells: Array<RawCell | null> }> = [];
  let emptyRowsSkipped = 0;
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (cells.every(isBlank)) emptyRowsSkipped++;
    else dataRows.push({ row: i + 1, cells });
  }

  if (dataRows.length > input.maxRows && input.truncateTo === undefined) {
    return { ok: false, issues: [{ ...fileIssue("TOO_MANY_ROWS", `Hay más de ${input.maxRows} filas con datos`), value: String(dataRows.length) }] };
  }
  const kept = input.truncateTo === undefined ? dataRows : dataRows.slice(0, input.truncateTo);
  const warnings: ImportIssue[] = [...fileLevel.filter((i) => i.severity !== "error"), ...mergeIssues];
  if (input.truncateTo !== undefined && dataRows.length > kept.length) {
    warnings.push({ row: null, field: "file", value: String(dataRows.length), label: `Solo se importaron las primeras ${kept.length} filas`, message: `Elegiste importar solo las primeras ${kept.length} de ${dataRows.length} filas; el resto se ignoró`, severity: "warning", code: "ROWS_TRUNCATED_BY_USER" });
  }

  const valid: ImportedRow[] = [];
  const rejected: RejectedRow[] = [];
  const errors: ImportIssue[] = [];

  for (const { row, cells } of kept) {
    const raw: Partial<Record<FieldKey, string>> = {};
    const rowIssues: ImportIssue[] = [];
    for (const [field, column] of byField) {
      const coerced = coerceCell(cells[columnIndex(column)], { url: field === "menuUrl" || field === "qrUrl" });
      raw[field] = coerced.text;
      for (const note of coerced.notes) rowIssues.push(noteIssue(row, column, field, note));
    }
    const extra: Record<string, string> = {};
    for (const m of extraColumns) {
      const text = coerceCell(cells[columnIndex(m.column)], { url: false }).text;
      const value = normalizeText(text).slice(0, MAX_EXTRA_LENGTH);
      if (value !== "") extra[m.header in extra ? `${m.header} (${m.column})` : m.header] = value;
    }

    const checked = validateDraft({ area: raw.area ?? "", estacion: raw.estacion ?? "", mesa: raw.mesa ?? "", subgrupo: raw.subgrupo ?? "", concepto: raw.concepto ?? "", menuUrl: raw.menuUrl ?? "", ...(raw.qrUrl === undefined ? {} : { qrUrl: raw.qrUrl }) });
    const checkIssues = (list: typeof checked.warnings) => list.map((c) => importIssueFromCheck(row, c, byField.get(c.field)));
    if (!checked.ok) rowIssues.push(...checkIssues(checked.issues));
    rowIssues.push(...checkIssues(checked.warnings));

    if (checked.ok) {
      const qrUrl = checked.draft.qrUrl;
      const host = qrUrl ? URL.parse(qrUrl) : null;
      if (qrUrl && host) {
        const column = byField.get("qrUrl");
        const unsafe = host.port !== "" && host.port !== "443" ? "El Link del QR usa un puerto distinto de 443" : host.username || host.password ? "El Link del QR lleva credenciales" : null;
        if (unsafe) rowIssues.push({ row, ...(column ? { column } : {}), field: "qrUrl", value: truncate200(qrUrl), label: "Link del QR no seguro", message: `${unsafe}; no se descargará y la pieza quedará bloqueada hasta corregirlo`, severity: "warning", code: "QR_URL_UNSAFE" });
        else if (input.isQrHostAllowed && !input.isQrHostAllowed(host.hostname.toLowerCase())) rowIssues.push({ row, ...(column ? { column } : {}), field: "qrUrl", value: truncate200(qrUrl), label: `Link del QR en un host no permitido (${host.hostname})`, message: `El host ${host.hostname} no está en la lista de hosts permitidos para QR existentes; la pieza quedará bloqueada hasta corregirlo`, severity: "warning", code: "QR_URL_HOST_NOT_ALLOWED" });
      }
    }

    const hasError = rowIssues.some((i) => i.severity === "error");
    if (checked.ok && !hasError) {
      valid.push({ row, draft: checked.draft as RecordDraft, extra, issues: rowIssues, duplicateKey: duplicateKey(checked.draft, config) });
    } else {
      rejected.push({ row, raw, extra, issues: rowIssues.filter((i) => i.severity === "error").concat(rowIssues.filter((i) => i.severity !== "error")) });
      errors.push(...rowIssues.filter((i) => i.severity === "error"));
    }
    warnings.push(...rowIssues.filter((i) => i.severity !== "error"));
  }

  // Duplicados dentro del archivo: la primera aparición es la original.
  const fileGroups = findFileDuplicates(valid, config);
  const duplicateRowNumbers = new Set<number>();
  for (const group of fileGroups) {
    const [first, ...rest] = group.rows;
    if (first === undefined) continue;
    for (const row of rest) {
      duplicateRowNumbers.add(row);
      warnings.push(duplicateInFileIssue(row, first, config.fields as readonly FieldKey[]));
    }
  }
  const successful = valid.filter((r) => !duplicateRowNumbers.has(r.row));
  const duplicateRows = valid.filter((r) => duplicateRowNumbers.has(r.row));

  return {
    ok: true,
    result: {
      ...base,
      totalRows: kept.length,
      successful,
      rejected,
      errors,
      warnings,
      duplicates: fileGroups,
      duplicateRows,
      stats: { valid: successful.length, withErrors: rejected.length, duplicates: duplicateRows.length, emptyRowsSkipped, ...(input.truncateTo !== undefined && dataRows.length > kept.length ? { truncatedTo: kept.length } : {}) },
    },
  };
}
