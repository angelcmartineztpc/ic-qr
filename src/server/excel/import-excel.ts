import "server-only";

import { csvToSheet, CsvRejection } from "@/lib/excel/csv";
import { chooseSheet } from "@/lib/excel/headers";
import { buildImportResult } from "@/lib/excel/import-pipeline";
import { fileIssue } from "@/lib/excel/file-issues";
import type { RawSheet } from "@/lib/excel/types";
import type { ColumnMapping, FieldKey, ImportResponse } from "@/types";

import { guardXlsx, ImportRejection, type GuardLimits } from "./upload-guard";
import { openWorkbook } from "./read-workbook";

export interface ImportOptions {
  fileName: string;
  /** Mapeo elegido por la persona: letra de columna → campo (o null). */
  columns?: Record<string, FieldKey | null> | undefined;
  sheet?: string | undefined;
  /** Importar solo las primeras N filas (acción explícita tras TOO_MANY_ROWS). */
  truncateTo?: number | undefined;
  defaultMenuUrl?: string | undefined;
  maxRows: number;
  limits: GuardLimits;
  isQrHostAllowed?: ((host: string) => boolean) | undefined;
  timeoutMs?: number | undefined;
}

const SCAN_ROWS = 26;

/** Aplica el mapeo manual sobre la detección automática (manual gana siempre). */
function applyOverride(detected: ColumnMapping[], overrides: Record<string, FieldKey | null>, headers: ReadonlyArray<string>): ColumnMapping[] {
  const letters = new Set(detected.map((m) => m.column));
  const merged = detected.map((m): ColumnMapping => (m.column in overrides ? { column: m.column, header: m.header, field: overrides[m.column] ?? null, match: "manual" } : m));
  for (const [column, field] of Object.entries(overrides)) {
    if (letters.has(column)) continue;
    const index = [...column].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
    merged.push({ column, header: headers[index] ?? "", field, match: "manual" });
  }
  // Un campo asignado a mano no puede seguir asignado automáticamente a otra columna.
  const manual = new Set(merged.flatMap((m) => (m.match === "manual" && m.field ? [m.field] : [])));
  return merged
    .map((m): ColumnMapping => (m.match !== "manual" && m.field && manual.has(m.field) ? { column: m.column, header: m.header, field: null, match: "none" } : m))
    .map((m): ColumnMapping => (m.match === "ambiguous" && m.candidates?.every((c) => manual.has(c)) ? { column: m.column, header: m.header, field: null, match: "none" } : m))
    .sort((a, b) => a.column.length - b.column.length || a.column.localeCompare(b.column));
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/** Importación de un .xlsx o un .csv: lo que no sea ninguno de los dos se rechaza con el motivo. Nunca lanza por un archivo malo. */
export async function importExcel(bytes: Uint8Array, options: ImportOptions): Promise<ImportResponse> {
  let reader: ReturnType<typeof openWorkbook> | undefined;
  try {
    const finish = (sheet: RawSheet, headerRowIndex: number, mapping: ColumnMapping[]): ImportResponse => {
      const result = buildImportResult({ fileName: options.fileName, sheet, headerRowIndex, mapping, maxRows: options.maxRows, truncateTo: options.truncateTo, defaultMenuUrl: options.defaultMenuUrl, isQrHostAllowed: options.isQrHostAllowed });
      return result.ok ? { ok: true, result: result.result } : { ok: false, issues: result.issues };
    };
    const overridden = (choice: { mapping: ColumnMapping[]; rowIndex: number; sheet: RawSheet }) => {
      if (!options.columns) return choice.mapping;
      const headers = (choice.sheet.rows[choice.rowIndex] ?? []).map((c) => (c ? String(c.w ?? c.v ?? "") : ""));
      return applyOverride(choice.mapping, options.columns, headers);
    };

    if (!isZip(bytes) && !isOle(bytes)) {
      // CSV: la misma tubería, sin worker (es texto plano y el tamaño ya está acotado).
      const sheet = csvToSheet(bytes, { maxRows: SCAN_ROWS + options.maxRows + 2, maxCells: options.limits.maxCells, maxColumns: 50 });
      const choice = chooseSheet([sheet]);
      return choice ? finish(sheet, choice.rowIndex, overridden(choice)) : { ok: false, issues: [fileIssue("NO_SHEET_WITH_HEADERS")] };
    }

    const guarded = guardXlsx(bytes, options.limits);
    reader = openWorkbook(guarded.zip, options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs });
    const sheets = await reader.scan(SCAN_ROWS);
    const choice = chooseSheet(sheets, options.sheet);
    if (!choice) return { ok: false, issues: [fileIssue("NO_SHEET_WITH_HEADERS")] };
    const sheet = await reader.read(choice.sheet.name, choice.rowIndex + 1 + options.maxRows + 1);
    return finish(sheet, choice.rowIndex, overridden(choice));
  } catch (error) {
    if (error instanceof ImportRejection) return { ok: false, issues: [error.toIssue()] };
    if (error instanceof CsvRejection) return { ok: false, issues: [new ImportRejection(error.code).toIssue()] };
    throw error;
  } finally {
    reader?.close();
  }
}

/** Nombre del archivo recibido en `X-File-Name` (codificado con encodeURIComponent). */
export function decodeFileName(header: string | null): string {
  let decoded = "archivo.xlsx";
  if (header) {
    try {
      decoded = decodeURIComponent(header);
    } catch {
      decoded = header;
    }
  }
  const clean = decoded.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 255);
  return clean === "" ? "archivo.xlsx" : clean;
}
