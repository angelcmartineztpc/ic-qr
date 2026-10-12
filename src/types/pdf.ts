import type { z } from "zod";

import type { ExportOptionsSchema, ExportRequestSchema } from "@/schemas/export";
import type { PageSizeSchema, PDFOptionsSchema } from "@/schemas/pdf";
import type { ExportRecordSchema } from "@/schemas/record";

import type { Mm } from "./common";

export type PageSize = z.output<typeof PageSizeSchema>;
export type PDFOptions = z.output<typeof PDFOptionsSchema>;
export type ExportOptions = z.output<typeof ExportOptionsSchema>;
export type ExportRecord = z.output<typeof ExportRecordSchema>;
export type ExportRequest = z.output<typeof ExportRequestSchema>;

/** Resultado de packGrid: rejilla de piezas en la página (mm). */
export interface SheetLayout {
  pageMm: { width: Mm; height: Mm };
  orientation: "portrait" | "landscape";
  cols: number;
  rows: number;
  perPage: number;
  /** Esquina superior izquierda de la pieza (sin sangrado) del slot 0. */
  originMm: { x: Mm; y: Mm };
  /** Distancia entre piezas consecutivas (pieza + 2·sangrado + gap). */
  pitchMm: { x: Mm; y: Mm };
}

export interface PageSlot {
  page: number;
  index: number;
  xMm: Mm;
  yMm: Mm;
}
