/**
 * Lectura de CSV como si fuera una hoja (misma tubería que .xlsx). Código puro:
 * decodifica (UTF-8 con o sin BOM; si no es UTF-8 válido, Windows-1252, que es
 * lo que guarda Excel en español), detecta el separador (coma, punto y coma o
 * tabulador) y respeta comillas. Un archivo que no es texto de tabla se rechaza.
 */
import type { RawCell, RawSheet } from "./types";

export class CsvRejection extends Error {
  constructor(readonly code: "NOT_A_ZIP" | "TOO_MANY_CELLS" | "TOO_MANY_COLUMNS") {
    super(code);
    this.name = "CsvRejection";
  }
}

export function decodeText(bytes: Uint8Array): string {
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const body = bytes.subarray(start);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}

/** ¿Parece un archivo binario (PDF, imagen, ZIP raro…) y no texto? */
export function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 8192);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return sample.length > 0 && control / sample.length > 0.02;
}

const DELIMITERS = [",", ";", "\t"] as const;

/** El separador que más columnas da de forma consistente en las primeras líneas (fuera de comillas). */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").slice(0, 10);
  let best: { delimiter: string; score: number } = { delimiter: ",", score: 0 };
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = first * consistent;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let n = 0;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) n++;
  }
  return n;
}

export interface CsvLimits {
  /** Filas como máximo a leer (cabecera incluida): lo que sobra no hace falta. */
  maxRows: number;
  maxCells: number;
  maxColumns: number;
}

/** RFC 4180: comillas dobles, `""` como comilla, saltos de línea dentro de comillas. */
export function parseCsv(text: string, delimiter: string, limits: CsvLimits): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let cells = 0;
  const endField = () => {
    row.push(field);
    field = "";
    if (++cells > limits.maxCells) throw new CsvRejection("TOO_MANY_CELLS");
    if (row.length > limits.maxColumns) throw new CsvRejection("TOO_MANY_COLUMNS");
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") inQuotes = true;
    else if (ch === delimiter) endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      if (rows.length >= limits.maxRows) return rows;
    } else field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** CSV → hoja cruda. `maxRows` incluye la cabecera y una fila de más para detectar el exceso. */
export function csvToSheet(bytes: Uint8Array, limits: CsvLimits): RawSheet {
  if (looksBinary(bytes)) throw new CsvRejection("NOT_A_ZIP");
  const text = decodeText(bytes);
  const rows = parseCsv(text, detectDelimiter(text), limits);
  const cells = rows.map((row) => {
    const out: Array<RawCell | null> = row.map((value) => (value === "" ? null : { t: "s", v: value, w: value }));
    while (out.length > 0 && out[out.length - 1] === null) out.pop();
    return out;
  });
  while (cells.length > 0 && cells[cells.length - 1]?.length === 0) cells.pop();
  return { name: "CSV", state: "visible", rows: cells, merges: [], rowCount: cells.length, colCount: Math.max(0, ...cells.map((r) => r.length)) };
}
