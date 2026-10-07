import type { TemplateInput } from "@/types";

import { PIECE_FONT_DIR, PIECE_FONT_FILES, pieceFont } from "../address-sans";

/** Variante que también imprime Estación, Sub-grupo y Concepto (muestra de plantilla alternativa). */
export const restaurantDefault = {
  schemaVersion: 1,
  id: "restaurant-default",
  name: "Restaurante · Completa",
  version: "1.0.0",
  tile: { width: 50, height: 50, safeMarginMm: 2, background: "#FFFFFF" },
  fontDir: PIECE_FONT_DIR,
  fonts: PIECE_FONT_FILES,
  defaultLayout: {
    content: { x: 3, y: 3, width: 44, height: 20 },
    qr: { x: 13, y: 24, width: 24, height: 24 },
  },
  content: {
    verticalAlign: "start",
    vMetric: "cap",
    items: [
      { type: "text", id: "area", text: "{{area}}", font: pieceFont(), sizePt: 12, trackingEm1000: 40, transform: "uppercase", fit: { mode: "shrink", minSizePt: 8 } },
      { type: "text", id: "detalle", text: "{{estacion}} · {{subgrupo}}", font: pieceFont(), sizePt: 5.5, marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 4.5 } },
      { type: "text", id: "mesa", text: "{{mesa}}", font: pieceFont(), sizePt: 18, transform: "uppercase", marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 11 } },
      { type: "text", id: "concepto", text: "{{concepto}}", font: pieceFont(), sizePt: 5.5, transform: "uppercase", marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 4.5 } },
      { type: "text", id: "cta", text: "CONSULTA EL MENÚ · LOOK AT THE MENU", font: pieceFont(), sizePt: 4.8, marginTopMm: 1, fit: { mode: "shrink", minSizePt: 4.5 } },
    ],
  },
  qr: { quietZoneModules: 2 },
} satisfies TemplateInput;
