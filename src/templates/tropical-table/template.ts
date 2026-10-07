import type { TemplateInput } from "@/types";

import { PIECE_FONT_DIR, PIECE_FONT_FILES, PIECE_INK, pieceFont } from "../address-sans";

/**
 * TropicalTable: la pieza de la referencia QR_Tropical_1M_Alimentos.pdf (70 × 70 mm).
 * Todas las medidas salen de ese PDF (posiciones de cada contorno medidas con pdf.js),
 * no de una estimación; el test `tropical-reference` las vigila.
 *
 *   ┌────────────────────────────┐   marco de 0.5 pt, color #2C2E35
 *   │         TROPICAL           │   17 pt, tracking −50
 *   │       MESA – TABLE         │   11 pt, tracking −40
 *   │            M1              │   22 pt, tracking −50
 *   │ CONSULTA EL MENU Y ORDENA… │   13.2 pt, tracking −25
 *   │ LOOK AT THE MENU AN ORDER… │   (los textos son literales de la referencia)
 *   │           [ QR ]           │   24.79 mm, módulos de 0.751 mm, sin zona de silencio propia
 *   └────────────────────────────┘
 * Estación, Sub-grupo y Concepto no se imprimen: son metadatos (§1.2-8).
 */
const text = { font: pieceFont(), color: PIECE_INK } as const;

export const tropicalTable = {
  schemaVersion: 1,
  id: "tropical-table",
  name: "Tropical · Mesa",
  version: "2.0.0",
  tile: { width: 70, height: 70, safeMarginMm: 2 },
  fontDir: PIECE_FONT_DIR,
  fonts: PIECE_FONT_FILES,
  defaultLayout: {
    content: { x: 4, y: 5.493, width: 62, height: 34 },
    qr: { x: 22.606, y: 39.424, width: 24.788, height: 24.788 },
  },
  content: {
    verticalAlign: "start",
    vMetric: "cap",
    items: [
      { type: "text", id: "area", text: "{{area}}", ...text, sizePt: 17, trackingEm1000: -50, transform: "uppercase", fit: { mode: "shrink", minSizePt: 10 } },
      { type: "text", id: "label", text: "MESA – TABLE", ...text, sizePt: 11, trackingEm1000: -40, marginTopMm: 2.268 },
      { type: "text", id: "mesa", text: "{{mesa}}", ...text, sizePt: 22, trackingEm1000: -50, transform: "uppercase", marginTopMm: 1.695, fit: { mode: "shrink", minSizePt: 12 } },
      { type: "text", id: "ctaEs", text: "CONSULTA EL MENU Y ORDENA EN LÍNEA", ...text, sizePt: 13.2, trackingEm1000: -25, marginTopMm: 5.036, fit: { mode: "shrink", minSizePt: 10 } },
      { type: "text", id: "ctaEn", text: "LOOK AT THE MENU AN ORDER ON LINE", ...text, sizePt: 13.2, trackingEm1000: -25, marginTopMm: 1.54, fit: { mode: "shrink", minSizePt: 10 } },
    ],
  },
  qr: { quietZoneModules: 0, foreground: PIECE_INK },
  shapes: [
    // Marco: anillo de 0.5 pt pegado al borde (trazo centrado a 0.25 pt).
    { type: "rect", id: "frame", box: { x: 0.0882, y: 0.0882, width: 69.8236, height: 69.8236 }, stroke: PIECE_INK, strokeWidthPt: 0.5 },
  ],
} satisfies TemplateInput;
