import type { TemplateInput } from "@/types";

import { GOTHAM_DIR, GOTHAM_FILES, gotham } from "../gotham";

/** Variante que también imprime Estación, Sub-grupo y Concepto (muestra de plantilla alternativa). */
export const restaurantDefault = {
  schemaVersion: 1,
  id: "restaurant-default",
  name: "Restaurante · Completa",
  version: "1.0.0",
  tile: { width: 50, height: 50, safeMarginMm: 2, background: "#FFFFFF" },
  fontDir: GOTHAM_DIR,
  fonts: GOTHAM_FILES,
  defaultLayout: {
    content: { x: 3, y: 3, width: 44, height: 22 },
    qr: { x: 14, y: 26, width: 22, height: 22 },
  },
  content: {
    verticalAlign: "start",
    vMetric: "cap",
    items: [
      { type: "text", id: "area", text: "{{area}}", font: gotham(800), sizePt: 12, trackingEm1000: 40, transform: "uppercase", fit: { mode: "shrink", minSizePt: 8 } },
      { type: "text", id: "detalle", text: "{{estacion}} · {{subgrupo}}", font: gotham(500), sizePt: 5.5, marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 4.5 } },
      { type: "text", id: "mesa", text: "{{mesa}}", font: gotham(800), sizePt: 18, transform: "uppercase", marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 11 } },
      { type: "text", id: "concepto", text: "{{concepto}}", font: gotham(700), sizePt: 5.5, transform: "uppercase", marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 4.5 } },
      { type: "text", id: "cta", text: "CONSULTA EL MENÚ · LOOK AT THE MENU", font: gotham(400), sizePt: 4.8, marginTopMm: 1, fit: { mode: "shrink", minSizePt: 4.5 } },
    ],
  },
  qr: { quietZoneModules: 2 },
} satisfies TemplateInput;
