import "server-only";

import { chooseSheet } from "@/lib/excel/headers";
import { buildImportResult } from "@/lib/excel/import-pipeline";
import { fileIssue } from "@/lib/excel/file-issues";
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

/** Importación completa de un .xlsx: guard → worker → cabeceras → filas. Nunca lanza por un archivo malo; devuelve ok:false con el motivo. */
export async function importExcel(bytes: Uint8Array, options: ImportOptions): Promise<ImportResponse> {
  let reader: ReturnType<typeof openWorkbook> | undefined;
  try {
    const guarded = guardXlsx(bytes, options.limits);
    reader = openWorkbook(guarded.zip, options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs });

    const sheets = await reader.scan(SCAN_ROWS);
    const choice = chooseSheet(sheets, options.sheet);
    if (!choice) return { ok: false, issues: [fileIssue("NO_SHEET_WITH_HEADERS")] };

    let mapping = choice.mapping;
    if (options.columns) {
      const headerCells = choice.sheet.rows[choice.rowIndex] ?? [];
      const headers = headerCells.map((c) => (c ? String(c.w ?? c.v ?? "") : ""));
      mapping = applyOverride(mapping, options.columns, headers);
    }

    const sheet = await reader.read(choice.sheet.name, choice.rowIndex + 1 + options.maxRows + 1);
    // La pasada 2 puede devolver menos filas iniciales vacías: la cabecera se vuelve a localizar por posición.
    const result = buildImportResult({ fileName: options.fileName, sheet, headerRowIndex: choice.rowIndex, mapping, maxRows: options.maxRows, truncateTo: options.truncateTo, isQrHostAllowed: options.isQrHostAllowed });
    return result.ok ? { ok: true, result: result.result } : { ok: false, issues: result.issues };
  } catch (error) {
    if (error instanceof ImportRejection) return { ok: false, issues: [error.toIssue()] };
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
