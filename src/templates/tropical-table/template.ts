import type { TemplateInput } from "@/types";

import { GOTHAM_DIR, GOTHAM_FILES, gotham } from "../gotham";

/**
 * TropicalTable: la pieza de la referencia visual (spec §2).
 *
 *            TROPICAL
 *          MESA – TABLE
 *               M1
 *   CONSULTA EL MENÚ Y ORDENA EN LÍNEA
 *   LOOK AT THE MENU AND ORDER ONLINE
 *              [ QR ]
 *
 * Valores de partida de docs/ARCHITECTURE.md §E.11 con Gotham. El presupuesto
 * vertical se vuelve a medir con Gotham en la Fase 4 (motor de texto con fontkit).
 * Estación, Sub-grupo y Concepto no se imprimen: son metadatos (§1.2-8).
 */
export const tropicalTable = {
  schemaVersion: 1,
  id: "tropical-table",
  name: "Tropical · Mesa",
  version: "1.0.0",
  tile: { width: 50, height: 50, safeMarginMm: 2, background: "#FFFFFF" },
  fontDir: GOTHAM_DIR,
  fonts: GOTHAM_FILES,
  defaultLayout: {
    content: { x: 4, y: 3, width: 42, height: 20 },
    qr: { x: 13, y: 24, width: 24, height: 24 },
  },
  content: {
    verticalAlign: "start",
    vMetric: "cap",
    items: [
      { type: "text", id: "area", text: "{{area}}", font: gotham(800), sizePt: 13, trackingEm1000: 50, transform: "uppercase", fit: { mode: "shrink", minSizePt: 9 } },
      { type: "text", id: "label", text: "MESA – TABLE", font: gotham(700), sizePt: 6, trackingEm1000: 100, marginTopMm: 1.6 },
      { type: "text", id: "mesa", text: "{{mesa}}", font: gotham(800), sizePt: 20, transform: "uppercase", marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 12 } },
      { type: "text", id: "ctaEs", text: "CONSULTA EL MENÚ Y ORDENA EN LÍNEA", font: gotham(700), sizePt: 5, marginTopMm: 1.8, fit: { mode: "shrink", minSizePt: 4.5 } },
      { type: "text", id: "ctaEn", text: "LOOK AT THE MENU AND ORDER ONLINE", font: gotham(500), sizePt: 5, marginTopMm: 0.9, fit: { mode: "shrink", minSizePt: 4.5 } },
    ],
  },
  qr: { quietZoneModules: 2 },
} satisfies TemplateInput;
