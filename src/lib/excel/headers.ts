/**
 * Detección de cabeceras (docs/ARCHITECTURE.md §S1.4). Código puro: recibe
 * texto y devuelve a qué campo corresponde cada columna y con qué certeza.
 */
import { FIELD_KEYS } from "@/schemas/record";
import type { ColumnMapping, FieldKey } from "@/types";

import { columnLetter, type RawCell, type RawSheet } from "./types";

/** `Link del menú (URL)` → `linkdelmenu`: NFD, sin diacríticos, sin paréntesis, minúsculas, solo [a-z0-9]. */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/\([^)]*\)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Alias ya normalizados por campo. Los exactos se aceptan sin aviso. */
const ALIASES: Record<FieldKey, readonly string[]> = {
  area: ["area", "areas", "zona", "restaurante", "outlet"],
  estacion: ["estacion", "estaciones", "station"],
  mesa: ["mesa", "mesas", "nomesa", "nmesa", "nummesa", "numeromesa", "nodemesa", "table", "tablenumber"],
  subgrupo: ["subgrupo", "subgrupos", "subgroup", "subgrp"],
  concepto: ["concepto", "conceptos", "concept"],
  menuUrl: ["linkmenu", "linkdelmenu", "linkdemenu", "urlmenu", "urldelmenu", "menuurl", "menulink", "menu", "enlacemenu", "enlacedelmenu"],
  qrUrl: ["linkqr", "linkdelqr", "linkdeqr", "qrlink", "qrurl", "urlqr", "urldelqr", "enlaceqr", "enlacedelqr", "qr"],
};

/** Palabras que delatan a qué campo pertenece una cabecera (veto cruzado). */
const KEY_TOKENS: ReadonlyArray<readonly [string, FieldKey]> = [
  ["qr", "qrUrl"],
  ["menu", "menuUrl"],
  ["mesa", "mesa"],
];

export function levenshtein(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      current.push(value);
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length] ?? limit + 1;
}

/** Presupuesto de errores por longitud: palabras cortas no admiten erratas. */
const budget = (length: number) => (length <= 4 ? 0 : length <= 8 ? 1 : 2);

export interface HeaderMatch {
  field: FieldKey | null;
  match: ColumnMapping["match"];
  candidates?: FieldKey[];
}

const NONE: HeaderMatch = { field: null, match: "none" };

export function matchHeader(header: string): HeaderMatch {
  const norm = normalizeHeader(header);
  if (norm === "") return NONE;

  const exact = FIELD_KEYS.filter((field) => ALIASES[field].includes(norm));
  if (exact.length === 1 && exact[0]) return { field: exact[0], match: "exact" };

  const contained = KEY_TOKENS.filter(([token]) => norm.includes(token)).map(([, field]) => field);
  if (contained.length > 1) return { field: null, match: "ambiguous", candidates: [...new Set(contained)] };

  // Aproximada: la distancia mínima a algún alias, dentro del presupuesto.
  let best: { field: FieldKey; distance: number } | null = null;
  let tie = false;
  for (const field of FIELD_KEYS) {
    for (const alias of ALIASES[field]) {
      const allowed = budget(Math.min(alias.length, norm.length));
      const distance = levenshtein(norm, alias, allowed);
      if (distance > allowed) continue;
      if (!best || distance < best.distance) {
        best = { field, distance };
        tie = false;
      } else if (distance === best.distance && best.field !== field) tie = true;
    }
  }
  if (best && !tie) {
    // Veto: si la cabecera nombra OTRO campo (p. ej. «linkqr» ≈ «linkmenu»), no se adivina.
    const other = contained.find((field) => field !== best.field);
    if (other) return { field: null, match: "ambiguous", candidates: [best.field, other] };
    return { field: best.field, match: "fuzzy" };
  }
  if (best && tie) return { field: null, match: "ambiguous", candidates: FIELD_KEYS.filter((f) => ALIASES[f].some((a) => levenshtein(norm, a, budget(Math.min(a.length, norm.length))) <= budget(Math.min(a.length, norm.length)))) };

  // Una sola palabra clave dentro de una cabecera más larga («Link del menú digital») → aproximada.
  if (contained.length === 1 && contained[0]) return { field: contained[0], match: "fuzzy" };
  return NONE;
}

const textOf = (cell: RawCell | null | undefined): string => {
  if (!cell || cell.t === "e" || cell.t === "z") return "";
  return String(cell.w ?? cell.v ?? "").trim();
};

/** Cabeceras de una fila: una entrada por columna con texto. Resuelve campos repetidos (gana el mejor y el más a la izquierda). */
export function mapHeaderRow(cells: ReadonlyArray<RawCell | null | undefined>): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  cells.forEach((cell, index) => {
    const header = textOf(cell);
    if (header === "") return;
    const { field, match, candidates } = matchHeader(header);
    mappings.push({ column: columnLetter(index), header: header.slice(0, 500), field, match, ...(candidates ? { candidates } : {}) });
  });

  const winners = new Map<FieldKey, ColumnMapping>();
  for (const mapping of mappings) {
    if (!mapping.field) continue;
    const current = winners.get(mapping.field);
    if (!current || (current.match === "fuzzy" && mapping.match === "exact")) winners.set(mapping.field, mapping);
  }
  return mappings.map((mapping) => {
    if (!mapping.field || winners.get(mapping.field) === mapping) return mapping;
    return { ...mapping, field: null, match: "ambiguous" as const, candidates: [mapping.field] };
  });
}

export const HEADER_SCAN_ROWS = 25;
const MIN_FIELDS_FOR_HEADER = 3;

export interface HeaderDetection {
  /** Índice 0-based de la fila de cabecera. */
  rowIndex: number;
  mapping: ColumnMapping[];
  /** Campos distintos reconocidos. */
  score: number;
}

const scoreOf = (mapping: readonly ColumnMapping[]) => new Set(mapping.flatMap((m) => (m.field ? [m.field] : []))).size;

/** Busca la fila de cabecera en las 25 primeras filas: la de más campos, con al menos 3. */
export function detectHeaderRow(rows: ReadonlyArray<ReadonlyArray<RawCell | null>>): HeaderDetection | null {
  let best: HeaderDetection | null = null;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, HEADER_SCAN_ROWS); rowIndex++) {
    const mapping = mapHeaderRow(rows[rowIndex] ?? []);
    const score = scoreOf(mapping);
    if (score >= MIN_FIELDS_FOR_HEADER && (!best || score > best.score)) best = { rowIndex, mapping, score };
  }
  return best;
}

export interface SheetChoice extends HeaderDetection {
  sheet: RawSheet;
}

/** Mejor hoja visible por puntuación de cabeceras (las hojas de instrucciones no puntúan). */
export function chooseSheet(sheets: readonly RawSheet[], preferred?: string): SheetChoice | null {
  let best: SheetChoice | null = null;
  for (const sheet of sheets) {
    if (sheet.state !== "visible") continue;
    const detection = detectHeaderRow(sheet.rows);
    if (!detection) continue;
    if (preferred !== undefined && sheet.name === preferred) return { ...detection, sheet };
    if (!best || detection.score > best.score) best = { ...detection, sheet };
  }
  return best;
}
