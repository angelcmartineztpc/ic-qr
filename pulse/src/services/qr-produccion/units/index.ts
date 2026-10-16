/**
 * Unidades físicas (docs/ARCHITECTURE.md §E.2). El milímetro es la fuente de
 * verdad geométrica; los puntos solo aparecen al escribir el PDF y las
 * unidades SVG al serializar. Los píxeles CSS son solo de pantalla y nunca se persisten.
 */
export const MM_PER_IN = 25.4;
export const MM_PER_CM = 10;
export const PT_PER_IN = 72;
/** 1 mm = 2.834645669… pt */
export const MM_TO_PT = PT_PER_IN / MM_PER_IN;
/** 1 pt = 0.352777… mm */
export const PT_TO_MM = MM_PER_IN / PT_PER_IN;
/** viewBox del SVG en décimas de mm: 500 × 500 para una pieza de 50 mm. */
export const SVG_UNITS_PER_MM = 10;
/** Solo para dibujar en pantalla (96 px por pulgada CSS). */
export const CSS_PX_PER_MM = 96 / MM_PER_IN;

export const PAGE_SIZES_MM = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
} as const;

export const cmToMm = (cm: number): number => cm * MM_PER_CM;
export const mmToCm = (mm: number): number => mm / MM_PER_CM;
export const mmToPt = (mm: number): number => mm * MM_TO_PT;
export const ptToMm = (pt: number): number => pt * PT_TO_MM;
export const mmToSvg = (mm: number): number => mm * SVG_UNITS_PER_MM;

/** Tamaño de página para pdfkit, siempre calculado desde mm (nunca el nombre 'A4' de pdfkit). */
export const pageSizePt = (widthMm: number, heightMm: number): [number, number] => [mmToPt(widthMm), mmToPt(heightMm)];

/** Redondeo a un paso decimal (por defecto 0.001) sin deriva binaria acumulada. */
export function round(value: number, step = 0.001): number {
  const inverse = Math.round(1 / step);
  return Math.round(value * inverse) / inverse;
}
