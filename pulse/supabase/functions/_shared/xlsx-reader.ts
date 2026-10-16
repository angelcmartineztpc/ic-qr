/**
 * Lectura y escritura de libros con SheetJS (la versión 0.20.x del CDN oficial de SheetJS: la de npm, 0.18.5, tiene
 * CVE conocidos y no se usa). Sin hilos: en Edge Functions el libro se lee dentro de la propia petición, acotado por
 * `guardXlsx` (tamaño, celdas e inflado, ANTES de llegar aquí) y por el límite de CPU de la plataforma.
 */
import * as XLSX from "xlsx";

import { ImportRejection } from "@/services/qr-produccion/backend/excel/upload-guard.ts";
import type { WorkbookOpener, WorkbookReader } from "@/services/qr-produccion/backend/excel/workbook-reader.ts";
import type { RawCell, RawSheet } from "@/services/qr-produccion/excel/types.ts";

/** Opciones comunes: nunca estilos, HTML ni VBA, y sin tocar el disco. */
const READ_OPTIONS = { type: "array", dense: true, cellDates: true, cellFormula: true, cellHTML: false, cellStyles: false, bookVBA: false, cellNF: false } as const;

interface XlsxCell {
  t: string;
  v?: unknown;
  w?: string;
  f?: string;
  l?: { Target?: string };
}

const isoOf = (date: Date): string => {
  const iso = date.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19);
};

function toRaw(cell: XlsxCell | null | undefined): RawCell | null {
  if (!cell) return null;
  const out: Record<string, unknown> = { t: cell.t };
  if (cell.v !== undefined && cell.v !== null) out["v"] = cell.v instanceof Date ? isoOf(cell.v) : typeof cell.v === "object" ? String(cell.v) : cell.v;
  if (typeof cell.w === "string") out["w"] = cell.w;
  if (typeof cell.f === "string") out["f"] = cell.f;
  if (cell.l && typeof cell.l.Target === "string") out["l"] = cell.l.Target;
  if (out["t"] === "z" && out["v"] === undefined && out["l"] === undefined) return null;
  return out as unknown as RawCell;
}

const rangeSize = (ref: string | undefined) => {
  if (!ref) return { rows: 0, cols: 0 };
  const range = XLSX.utils.decode_range(ref);
  return { rows: range.e.r + 1, cols: range.e.c + 1 };
};

const hiddenState = (workbook: XLSX.WorkBook, index: number): RawSheet["state"] => {
  const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0;
  return hidden === 2 ? "veryHidden" : hidden === 1 ? "hidden" : "visible";
};

function toRawSheet(name: string, state: RawSheet["state"], sheet: XLSX.WorkSheet): RawSheet {
  const data = ((sheet as unknown as Record<string, unknown>)["!data"] ?? []) as Array<Array<XlsxCell | undefined> | undefined>;
  const rows = data.map((row) => {
    const cells = (row ?? []).map(toRaw);
    while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop();
    return cells;
  });
  while (rows.length > 0 && (rows[rows.length - 1] as unknown[]).length === 0) rows.pop();
  const full = rangeSize(((sheet as unknown as Record<string, unknown>)["!fullref"] ?? sheet["!ref"]) as string | undefined);
  const merges = (sheet["!merges"] ?? []).map((m) => [m.s.r, m.s.c, m.e.r, m.e.c] as [number, number, number, number]);
  return { name, state, rows, merges, rowCount: full.rows, colCount: full.cols } as RawSheet;
}

const guard = <T>(read: () => T): T => {
  try {
    return read();
  } catch {
    throw new ImportRejection("ZIP_CORRUPT", "SheetJS no pudo leer el libro");
  }
};

export const openWorkbook: WorkbookOpener = (zip: Uint8Array): WorkbookReader => ({
  async scan(rows) {
    return guard(() => {
      const workbook = XLSX.read(zip.slice(), { ...READ_OPTIONS, sheetRows: rows });
      return workbook.SheetNames.map((name, index) => toRawSheet(name, hiddenState(workbook, index), workbook.Sheets[name] as XLSX.WorkSheet));
    });
  },
  async read(sheetName, rows) {
    return guard(() => {
      const workbook = XLSX.read(zip.slice(), { ...READ_OPTIONS, sheets: [sheetName], sheetRows: rows });
      return toRawSheet(sheetName, hiddenState(workbook, workbook.SheetNames.indexOf(sheetName)), workbook.Sheets[sheetName] as XLSX.WorkSheet);
    });
  },
  close() {},
});

/** .xlsx de una hoja: encabezados + filas de texto, con el ancho de columna dado. */
export function writeWorkbook(sheetName: string, header: readonly string[], rows: readonly (readonly string[])[], widths: readonly number[]): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([[...header], ...rows.map((row) => [...row])]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
