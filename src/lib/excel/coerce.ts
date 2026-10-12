/**
 * Coerción de celdas a texto (docs/ARCHITECTURE.md §S1.6). Excel entrega
 * números, fechas, booleanos y fórmulas; el formulario trabaja con texto libre.
 * Devuelve el texto y los avisos que corresponden; la validación del campo
 * (obligatorio, URL, longitud) la hace después `validateDraft`.
 */
import type { ImportIssueCode } from "@/types";

import type { RawCell } from "./types";

export interface CellNote {
  code: ImportIssueCode;
  severity: "error" | "warning" | "info";
  /** Texto de apoyo para el mensaje (valor original, destino del enlace…). */
  detail?: string;
}

export interface CoercedCell {
  text: string;
  notes: CellNote[];
}

const URL_LIKE = /^https?:\/\//i;
const HYPERLINK_LITERAL = /^\s*HYPERLINK\(\s*"((?:[^"]|"")*)"/i;

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return value.toFixed(0);
  // 15 dígitos significativos: evita 0.30000000000000004 y «1.0».
  return String(Number.parseFloat(value.toPrecision(15)));
}

export function coerceCell(cell: RawCell | null | undefined, options: { url: boolean }): CoercedCell {
  if (!cell) return { text: "", notes: [] };
  const notes: CellNote[] = [];

  if (cell.t === "e") {
    return { text: "", notes: [{ code: "CELL_ERROR", severity: "error", detail: String(cell.w ?? cell.v ?? "#ERROR") }] };
  }

  let text = baseText(cell, notes);

  if (options.url) {
    const literal = cell.f ? HYPERLINK_LITERAL.exec(cell.f)?.[1]?.replaceAll('""', '"') : undefined;
    if (cell.l !== undefined && cell.l !== "") {
      if (URL_LIKE.test(text) && text.trim() !== cell.l.trim()) notes.push({ code: "HYPERLINK_TEXT_MISMATCH", severity: "warning", detail: text });
      text = cell.l;
    } else if (literal !== undefined) {
      text = literal;
    } else if (cell.f && /^\s*HYPERLINK\(/i.test(cell.f)) {
      notes.push({ code: "HYPERLINK_FORMULA_UNRESOLVED", severity: "warning" });
    }
  }
  return { text, notes };
}

function baseText(cell: RawCell, notes: CellNote[]): string {
  const hasValue = cell.v !== undefined && cell.v !== "";
  if (!hasValue) {
    if (cell.f) notes.push({ code: "FORMULA_NO_CACHED_VALUE", severity: "warning" });
    return "";
  }
  switch (cell.t) {
    case "n":
      return formatNumber(Number(cell.v));
    case "b":
      notes.push({ code: "BOOLEAN_CELL", severity: "warning", detail: String(cell.v) });
      return cell.v ? "TRUE" : "FALSE";
    case "d":
      notes.push({ code: "DATE_CELL", severity: "warning", detail: String(cell.w ?? cell.v) });
      return String(cell.v);
    default:
      return String(cell.v);
  }
}
