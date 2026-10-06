import type { TemplateInput } from "@/types";

import { GOTHAM_DIR, GOTHAM_FILES, gotham } from "../gotham";

/**
 * Esqueleto para crear una plantilla nueva (ver README.md de esta carpeta).
 * Copia esta carpeta, cambia `id`, y regístrala en src/templates/index.ts.
 */
export const customTemplate = {
  schemaVersion: 1,
  id: "custom-template",
  name: "Plantilla personalizada",
  version: "0.1.0",
  // Tamaño físico de la pieza en mm. safeMarginMm: zona que el editor marca como margen de seguridad.
  tile: { width: 50, height: 50, safeMarginMm: 2, background: "#FFFFFF" },
  fontDir: GOTHAM_DIR,
  // Toda fuente usada en `content.items` debe declararse aquí (se valida).
  fonts: GOTHAM_FILES,
  // Cajas en mm desde la esquina superior izquierda. El QR debe ser cuadrado.
  defaultLayout: {
    content: { x: 4, y: 4, width: 42, height: 16 },
    qr: { x: 13, y: 22, width: 24, height: 24 },
  },
  content: {
    verticalAlign: "start",
    vMetric: "cap",
    // `text` admite literales y los campos {{area}}, {{estacion}}, {{mesa}}, {{subgrupo}}, {{concepto}}, {{menuUrl}}.
    items: [
      { type: "text", id: "titulo", text: "{{area}}", font: gotham(800), sizePt: 12, transform: "uppercase", fit: { mode: "shrink", minSizePt: 8 } },
      { type: "text", id: "mesa", text: "{{mesa}}", font: gotham(800), sizePt: 18, marginTopMm: 1.5 },
    ],
  },
  qr: { quietZoneModules: 2 },
} satisfies TemplateInput;
