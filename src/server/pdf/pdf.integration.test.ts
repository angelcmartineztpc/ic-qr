import { describe, expect, it } from "vitest";

import { outlineScene } from "@/lib/document/outline";
import { mmToPt, pageSizePt } from "@/lib/units";
import { PDFOptionsSchema } from "@/schemas/pdf";
import type { PDFOptions } from "@/types";

import { extractText, inspectPdf, pageContents, paintedImageOps } from "../../../tests/helpers/pdf-inspect";
import { HAS_GOTHAM, registry, sampleScene, tropical } from "../../../tests/helpers/gotham";
import { renderPdfToBuffer } from "./writer";

const options = (overrides: Partial<PDFOptions> = {}): PDFOptions => ({ ...PDFOptionsSchema.parse({}), ...overrides });
const tile = { width: 50, height: 50 };
const fonts = registry.forTemplate(tropical());
const DATE = new Date("2026-10-06T12:00:00Z");

async function build(pdf: PDFOptions, count = 1, outlined = true) {
  const scenes = Array.from({ length: count }, (_, i) => {
    const scene = sampleScene({ id: `r${i}`, mesa: `M${i + 1}` }, { bleedMm: pdf.bleedMm, cutLine: pdf.cutLine, includeQrBackground: pdf.includeQrBackground });
    return outlined ? outlineScene(scene, fonts) : scene;
  });
  return renderPdfToBuffer(scenes, { tile, pdf, fonts, creationDate: DATE, compress: false, title: "Test" });
}

describe.skipIf(!HAS_GOTHAM)("PDF vectorial (requiere Gotham: bun run fonts:setup)", () => {
  it("hoja A4: MediaBox exacta, 0 imágenes y 15 piezas por página (spec §3, §18, §19)", async () => {
    const bytes = await build(options(), 16);
    const report = await inspectPdf(bytes);
    const [w, h] = pageSizePt(210, 297);

    expect(report.pageCount).toBe(2);
    for (const box of report.mediaBoxes) {
      expect(Math.abs((box[2] ?? 0) - w)).toBeLessThan(1e-4);
      expect(Math.abs((box[3] ?? 0) - h)).toBeLessThan(1e-4);
    }
    expect(report.imageObjects).toBe(0);
    expect(await paintedImageOps(bytes)).toBe(0);
  });

  it("cada pieza mide 50 × 50 mm = 141.732 pt y su origen es (25, 13.5) mm", async () => {
    const [content] = await pageContents(await build(options(), 1));
    // Por pieza: q · translate(70.866142, 38.267717) · scale(2.834646).
    expect(content).toContain("1 0 0 -1 0 841.889764 cm"); // pdfkit pasa a coordenadas con y hacia abajo (A4 exacto)
    expect(content).toContain("1 0 0 1 70.866142 38.267717 cm"); // (25, 13.5) mm
    expect(content).toContain("2.834646 0 0 2.834646 0 0 cm"); // 1 mm = 2.834646 pt
    expect(mmToPt(50)).toBeCloseTo(141.732283, 6);
  });

  it("modo contornos: 0 fuentes y 0 operadores de texto", async () => {
    const bytes = await build(options(), 3, true);
    const report = await inspectPdf(bytes);
    const [content] = await pageContents(bytes);
    expect(report.fontFiles).toBe(0);
    expect(content).not.toMatch(/\bBT\b/);
    expect(content).not.toMatch(/\bTj\b|\bTJ\b/);
  });

  it("QR: un solo path compuesto por pieza relleno even-odd (f*)", async () => {
    const [content] = await pageContents(await build(options(), 1));
    expect(content?.match(/^f\*$/gm)?.length).toBe(1);
  });

  it("modo texto vivo: fuentes Gotham incrustadas con ToUnicode y el texto sigue siendo texto", async () => {
    const bytes = await build(options({ textMode: "live" }), 1, false);
    const report = await inspectPdf(bytes);
    expect(report.fontFiles).toBeGreaterThanOrEqual(3);
    expect(report.fontsWithToUnicode).toBe(report.fontsTotal);
    expect(report.fontNames.every((name) => /Gotham/.test(name))).toBe(true);
    const [text] = await extractText(bytes);
    expect(text).toContain("MESA – TABLE");
    expect(text).toContain("CONSULTA EL MENÚ Y ORDENA EN LÍNEA");
    expect(text).toContain("LOOK AT THE MENU AND ORDER ONLINE");
    expect(text).toContain("TROPICAL");
    expect(await paintedImageOps(bytes)).toBe(0);
  });

  it("modo 'single': una página de 141.732 × 141.732 pt por pieza", async () => {
    const report = await inspectPdf(await build(options({ mode: "single" }), 3));
    expect(report.pageCount).toBe(3);
    for (const box of report.mediaBoxes) {
      expect(box[2]).toBeCloseTo(141.732283, 4);
      expect(box[3]).toBeCloseTo(141.732283, 4);
    }
  });

  it("'single' con sangrado: MediaBox mayor y TrimBox = tamaño de la pieza", async () => {
    const report = await inspectPdf(await build(options({ mode: "single", bleedMm: 2 }), 1));
    expect(report.mediaBoxes[0]?.[2]).toBeCloseTo(mmToPt(54), 4);
    expect(report.trimBoxes[0]?.map((v) => Math.round(v * 1000) / 1000)).toEqual([5.669, 5.669, 147.402, 147.402]);
  });

  it("tamaño Letter y personalizado", async () => {
    const letter = await inspectPdf(await build(options({ pageSize: { kind: "Letter" } }), 1));
    expect(letter.mediaBoxes[0]?.[2]).toBeCloseTo(612, 3);
    expect(letter.mediaBoxes[0]?.[3]).toBeCloseTo(792, 3);
    const custom = await inspectPdf(await build(options({ orientation: "landscape", pageSize: { kind: "custom", widthMm: 150, heightMm: 100 }, margins: { top: 5, right: 5, bottom: 5, left: 5 } }), 1));
    expect(custom.mediaBoxes[0]?.[2]).toBeCloseTo(mmToPt(150), 4);
  });

  it("nivel 2: CMYK y tinta plana CutContour como Separation", async () => {
    const cmyk = await inspectPdf(await build(options({ colorSpace: "cmyk", cutLine: "spot" }), 1));
    expect(cmyk.separations).toContain("CutContour");
    expect(cmyk.usesDeviceCmyk).toBe(true);
    expect(cmyk.imageObjects).toBe(0);
  });

  it("1000 piezas en menos de 10 s (spec §32)", async () => {
    const start = performance.now();
    const bytes = await build(options(), 1000);
    const seconds = (performance.now() - start) / 1000;
    expect((await inspectPdf(bytes)).pageCount).toBe(67);
    expect(seconds).toBeLessThan(10);
  }, 60_000);
});
