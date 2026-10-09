/**
 * Genera muestras REALES para abrir en Illustrator / Figma / Inkscape y para
 * el taller (puerta de aceptación de la Fase 4). Salida en out/.
 *
 *   bun run render:sample        (o: npm run render:sample)
 *
 * Archivos:
 *   sample-sheet.pdf        hoja A4 con 15 piezas, texto en contornos (para fabricación)
 *   sample-single.pdf       una pieza por página (50 × 50 mm = una mesa de trabajo por pieza)
 *   sample-live.pdf         texto vivo (fuente incrustada; instálala para editarlo)
 *   sample-cmyk-cutline.pdf CMYK + línea de corte CutContour (tinta plana)
 *   sample.svg              una pieza, texto en contornos
 *   sample-live.svg         una pieza, texto vivo
 *   calibration.pdf         hoja de calibración para grabar en el material real
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { calibrationTiles } from "../src/lib/document/calibration";
import { outlineScene } from "../src/lib/document/outline";
import { buildScene } from "../src/lib/document/scene";
import { renderSceneSvg } from "../src/lib/svg/render-scene";
import { encodeMatrix } from "../src/lib/qr/encode";
import { PDFOptionsSchema } from "../src/schemas/pdf";
import { NodeFontRegistry } from "../src/server/fonts/node-font-registry";
import { renderPdfToBuffer } from "../src/server/pdf/writer";
import { getTemplate } from "../src/templates";
import type { PDFOptions, QrGeometry, Template, TileScene } from "../src/types";

const out = join(process.cwd(), "out");
mkdirSync(out, { recursive: true });

const found = getTemplate("tropical-table");
if (!found) throw new Error("falta la plantilla tropical-table");
const template: Template = found;
const registry = new NodeFontRegistry(join(process.cwd(), "assets", "fonts"));
const fonts = registry.forTemplate(template);
const tile = { width: template.tile.width, height: template.tile.height };

const qrOf = (payload: string): QrGeometry => {
  const matrix = encodeMatrix(payload);
  return { kind: "matrix", matrix, modules: matrix.length };
};

const areas = ["Tropical", "Tropical", "Tropical", "Tropical", "Tropical", "Tropical", "Terraza Norte", "Terraza Norte", "Terraza Norte", "Bar", "Bar", "Bar", "Restaurante Tropical Playa", "VIP", "VIP"];
const records = areas.map((area, i) => ({
  id: `sample-${i + 1}`,
  area,
  estacion: "",
  mesa: `M${i + 1}`,
  subgrupo: "",
  concepto: "",
  menuUrl: `https://menu.example.com/${area.toLowerCase().replace(/\s+/g, "-")}?mesa=M${i + 1}`,
}));

const pdfOptions = (overrides: Partial<PDFOptions> = {}): PDFOptions => ({ ...PDFOptionsSchema.parse({}), ...overrides });

function scenes(pdf: PDFOptions, outlined: boolean): TileScene[] {
  return records.map((record) => {
    const scene = buildScene({
      template,
      layout: template.defaultLayout,
      record,
      qr: qrOf(record.menuUrl),
      fonts,
      options: { cutLine: pdf.cutLine, bleedMm: pdf.bleedMm, includeQrBackground: pdf.includeQrBackground },
    });
    return outlined ? outlineScene(scene, fonts) : scene;
  });
}

async function writePdf(name: string, pdf: PDFOptions, outlined: boolean) {
  const bytes = await renderPdfToBuffer(scenes(pdf, outlined), { tile, pdf, fonts, title: name });
  writeFileSync(join(out, name), bytes);
  console.log(`✓ out/${name} (${(bytes.length / 1024).toFixed(0)} KB)`);
}

await writePdf("sample-sheet.pdf", pdfOptions({ textMode: "outlined" }), true);
await writePdf("sample-single.pdf", pdfOptions({ mode: "single", textMode: "outlined" }), true);
await writePdf("sample-live.pdf", pdfOptions({ textMode: "live" }), false);
await writePdf("sample-cmyk-cutline.pdf", pdfOptions({ colorSpace: "cmyk", cutLine: "spot" }), true);

const first = scenes(pdfOptions(), false)[0];
if (first) {
  const svgTitle = "Tropical · M1";
  writeFileSync(join(out, "sample.svg"), renderSceneSvg(outlineScene(first, fonts), { title: svgTitle }));
  writeFileSync(join(out, "sample-live.svg"), renderSceneSvg(first, { title: svgTitle }));
  console.log("✓ out/sample.svg, out/sample-live.svg");
}

const calibration = calibrationTiles(template).map((c) =>
  outlineScene(buildScene({ template: c.template, layout: c.layout, record: c.record, qr: c.qr, fonts: registry.forTemplate(c.template) }), registry.forTemplate(c.template)),
);
const calBytes = await renderPdfToBuffer(calibration, { tile, pdf: pdfOptions(), fonts, title: "Hoja de calibración" });
writeFileSync(join(out, "calibration.pdf"), calBytes);
console.log(`✓ out/calibration.pdf (${calibration.length} piezas)`);
