/**
 * Datos crudos que el worker de SheetJS entrega al resto del pipeline. Son
 * JSON plano (se clonan entre hilos): ni fechas, ni funciones, ni objetos de SheetJS.
 */
export interface RawCell {
  /** Tipo de SheetJS: s texto, n número, b booleano, d fecha (ISO en `v`), e error, z vacía con formato. */
  t: "s" | "n" | "b" | "d" | "e" | "z";
  v?: string | number | boolean;
  /** Texto formateado tal como lo muestra Excel. */
  w?: string;
  /** Fórmula (sin el `=`), si la hay. */
  f?: string;
  /** Destino del hipervínculo de la celda. */
  l?: string;
}

export interface RawSheet {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  /** Matriz densa por filas: `rows[r][c]` es la celda de la fila r (0-based) y columna c, o null si está vacía. */
  rows: Array<Array<RawCell | null>>;
  /** Celdas combinadas como [fila0, col0, fila1, col1] (0-based, inclusive). */
  merges: Array<[number, number, number, number]>;
  /** Filas y columnas realmente presentes en la hoja (aunque `rows` esté recortado). */
  rowCount: number;
  colCount: number;
}

export interface ScanResult {
  sheets: RawSheet[];
}

/** Letra de columna de un índice 0-based: 0 → A, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
