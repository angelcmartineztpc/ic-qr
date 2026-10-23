import type { RawSheet } from "@/services/qr-produccion/excel/types";

/**
 * Puerto de lectura del libro. La implementación (SheetJS) vive en
 * supabase/functions/_shared/xlsx-reader.ts: aquí no se importa `xlsx` para que la lógica
 * pura se pruebe sin esa dependencia. En Edge Functions no hay hilos: el libro se lee dentro de
 * la propia petición, acotado por upload-guard (tamaño, celdas e inflado) y por el límite de CPU de la plataforma.
 */
export interface WorkbookReader {
  /** Pasada 1: las primeras filas de todas las hojas, solo para detectar cabeceras y elegir hoja. */
  scan(rows: number): Promise<RawSheet[]>;
  /** Pasada 2: la hoja elegida, hasta `rows` filas. */
  read(sheet: string, rows: number): Promise<RawSheet>;
  close(): void;
}

export type WorkbookOpener = (zip: Uint8Array) => WorkbookReader;
