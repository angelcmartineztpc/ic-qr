/**
 * Lectura de .xlsx con SheetJS (docs/ARCHITECTURE.md §S1.3). Solo devuelve celdas crudas; la
 * detección de cabeceras, la coerción y la validación viven en src/lib/excel (código puro y probado).
 *
 * Lo usan dos caminos: el hilo de `parse-worker.mjs` (Node: aislado, con límite de memoria y de
 * tiempo) y, donde no hay hilos (Cloudflare Workers), la propia petición (read-workbook.ts).
 */
import * as XLSX from "xlsx";

/** Opciones comunes: nunca estilos, HTML ni VBA, y sin tocar el disco. */
const READ_OPTIONS = { type: "buffer", dense: true, cellDates: true, cellFormula: true, cellHTML: false, cellStyles: false, bookVBA: false, cellNF: false };

function isoOf(date) {
  const iso = date.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19);
}

function toRaw(cell) {
  if (!cell) return null;
  const out = { t: cell.t };
  if (cell.v !== undefined && cell.v !== null) out.v = cell.v instanceof Date ? isoOf(cell.v) : typeof cell.v === "object" ? String(cell.v) : cell.v;
  if (typeof cell.w === "string") out.w = cell.w;
  if (typeof cell.f === "string") out.f = cell.f;
  if (cell.l && typeof cell.l.Target === "string") out.l = cell.l.Target;
  if (out.t === "z" && out.v === undefined && out.l === undefined) return null;
  return out;
}

function rangeSize(ref) {
  if (!ref) return { rows: 0, cols: 0 };
  const range = XLSX.utils.decode_range(ref);
  return { rows: range.e.r + 1, cols: range.e.c + 1 };
}

function toRawSheet(name, state, sheet) {
  const data = sheet["!data"] ?? [];
  const rows = data.map((row) => {
    const cells = (row ?? []).map(toRaw);
    while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop();
    return cells;
  });
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  const full = rangeSize(sheet["!fullref"] ?? sheet["!ref"]);
  const merges = (sheet["!merges"] ?? []).map((m) => [m.s.r, m.s.c, m.e.r, m.e.c]);
  return { name, state, rows, merges, rowCount: full.rows, colCount: full.cols };
}

function hiddenState(workbook, index) {
  const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0;
  return hidden === 2 ? "veryHidden" : hidden === 1 ? "hidden" : "visible";
}


/** Pasada 1: las primeras filas de todas las hojas. */
export function scanWorkbook(zip, rows) {
  const workbook = XLSX.read(zip, { ...READ_OPTIONS, sheetRows: rows });
  return workbook.SheetNames.map((name, index) => toRawSheet(name, hiddenState(workbook, index), workbook.Sheets[name]));
}

/** Pasada 2: la hoja elegida, hasta `rows` filas. */
export function readSheet(zip, sheetName, rows) {
  const workbook = XLSX.read(zip, { ...READ_OPTIONS, sheets: [sheetName], sheetRows: rows });
  const index = workbook.SheetNames.indexOf(sheetName);
  return toRawSheet(sheetName, hiddenState(workbook, index), workbook.Sheets[sheetName]);
}
