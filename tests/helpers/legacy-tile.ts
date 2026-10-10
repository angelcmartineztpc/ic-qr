import { TemplateSchema } from "@/schemas/template";
import type { Template } from "@/types";

/**
 * Plantilla de PRUEBA de 50 × 50 mm (la geometría original de «TropicalTable» antes de
 * adoptar la referencia de 70 mm). Sirve para probar el motor de escena/SVG con una fuente
 * falsa y números redondos; la plantilla real se verifica contra el PDF de referencia en
 * src/server/fonts/piece-font.integration.test.ts.
 */
const weight = (w: number) => ({ family: "Gotham", weight: w, style: "normal" as const });

export const legacyTile = (): Template =>
  TemplateSchema.parse({
    schemaVersion: 1,
    id: "tropical-table",
    name: "Tropical · Mesa (50 mm de prueba)",
    version: "1.0.0",
    tile: { width: 50, height: 50, safeMarginMm: 2, background: "#FFFFFF" },
    fontDir: "gotham",
    fonts: [400, 500, 700, 800].map((w) => ({ ...weight(w), file: `Gotham-${w}.woff2` })),
    defaultLayout: { content: { x: 4, y: 3, width: 42, height: 20 }, qr: { x: 13, y: 24, width: 24, height: 24 } },
    content: {
      verticalAlign: "start",
      vMetric: "cap",
      items: [
        { type: "text", id: "area", text: "{{area}}", font: weight(800), sizePt: 13, trackingEm1000: 50, transform: "uppercase", fit: { mode: "shrink", minSizePt: 9 } },
        { type: "text", id: "label", text: "MESA – TABLE", font: weight(700), sizePt: 6, trackingEm1000: 100, marginTopMm: 1.6 },
        { type: "text", id: "mesa", text: "{{mesa}}", font: weight(800), sizePt: 20, transform: "uppercase", marginTopMm: 1.2, fit: { mode: "shrink", minSizePt: 12 } },
        { type: "text", id: "ctaEs", text: "CONSULTA EL MENÚ Y ORDENA EN LÍNEA", font: weight(700), sizePt: 5, marginTopMm: 1.8, fit: { mode: "shrink", minSizePt: 4.5 } },
        { type: "text", id: "ctaEn", text: "LOOK AT THE MENU AND ORDER ONLINE", font: weight(500), sizePt: 5, marginTopMm: 0.9, fit: { mode: "shrink", minSizePt: 4.5 } },
      ],
    },
    qr: { quietZoneModules: 2 },
  });
