import { describe, expect, it } from "vitest";

import { outlineScene } from "@/lib/document/outline";
import { mmToPt, pageSizePt } from "@/lib/units";
import { PDFOptionsSchema } from "@/schemas/pdf";
import type { PDFOptions } from "@/types";

import { extractText, inspectPdf, pageContents, paintedImageOps } from "../../../tests/helpers/pdf-inspect";
import { HAS_PIECE_FONT, registry, sampleScene, tropical } from "../../../tests/helpers/piece-font";
import { renderPdfToBuffer } from "./writer";

const options = (overrides: Partial<PDFOptions> = {}): PDFOptions => ({ ...PDFOptionsSchema.parse({}), ...overrides });
const tile = { width: 70, height: 70 };
const fonts = registry.forTemplate(tropical());
const DATE = new Date("2026-10-06T12:00:00Z");

async function build(pdf: PDFOptions, count = 1, outlined = true) {
  const scenes = Array.from({ length: count }, (_, i) => {
    const scene = sampleScene({ id: `r${i}`, mesa: `M${i + 1}` }, { bleedMm: pdf.bleedMm, cutLine: pdf.cutLine, includeQrBackground: pdf.includeQrBackground });
    return outlined ? outlineScene(scene, fonts) : scene;
  });
  return renderPdfToBuffer(scenes, { tile, pdf, fonts, creationDate: DATE, compress: false, title: "Test" });
}

describe.skipIf(!HAS_PIECE_FONT)("PDF vectorial (requiere la fuente de las piezas: bun run fonts:setup)", () => {
  it("hoja A4: MediaBox exacta, 0 imágenes y 6 piezas por página (2 × 3 de 70 mm) (spec §3, §18, §19)", async () => {
    const bytes = await build(options(), 16);
    const report = await inspectPdf(bytes);
    const [w, h] = pageSizePt(210, 297);

    expect(report.pageCount).toBe(3); // 16 piezas, 6 por hoja
    for (const box of report.mediaBoxes) {
      expect(Math.abs((box[2] ?? 0) - w)).toBeLessThan(1e-4);
      expect(Math.abs((box[3] ?? 0) - h)).toBeLessThan(1e-4);
    }
    expect(report.imageObjects).toBe(0);
    expect(await paintedImageOps(bytes)).toBe(0);
  });

  it("cada pieza mide 70 × 70 mm = 198.425 pt y su origen es (32.5, 38.5) mm", async () => {
    const [content] = await pageContents(await build(options(), 1));
    // Por pieza: q · translate(92.125984, 109.133858) · scale(2.834646).
    expect(content).toContain("1 0 0 -1 0 841.889764 cm"); // pdfkit pasa a coordenadas con y hacia abajo (A4 exacto)
    expect(content).toContain("1 0 0 1 92.125984 109.133858 cm"); // (32.5, 38.5) mm
    expect(content).toContain("2.834646 0 0 2.834646 0 0 cm"); // 1 mm = 2.834646 pt
    expect(mmToPt(70)).toBeCloseTo(198.425197, 6);
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

  it("modo texto vivo: fuente de las piezas incrustada con ToUnicode y el texto sigue siendo texto", async () => {
    const bytes = await build(options({ textMode: "live" }), 1, false);
    const report = await inspectPdf(bytes);
    expect(report.fontFiles).toBeGreaterThanOrEqual(1);
    expect(report.fontsWithToUnicode).toBe(report.fontsTotal);
    expect(report.fontNames.every((name) => /AddressSansPro/.test(name))).toBe(true);
    const [raw] = await extractText(bytes);
    const text = (raw ?? "").replace(/\s+/g, " "); // el tracking negativo hace que pdf.js separe letras con espacios
    expect(text.replaceAll(" ", "")).toContain("MESA–TABLE");
    expect(text.replaceAll(" ", "")).toContain("CONSULTAELMENUYORDENAENLÍNEA");
    expect(text.replaceAll(" ", "")).toContain("LOOKATTHEMENUANORDERONLINE");
    expect(text.replaceAll(" ", "")).toContain("TROPICAL");
    expect(await paintedImageOps(bytes)).toBe(0);
  });

  it("modo 'single': una página de 198.425 × 198.425 pt por pieza", async () => {
    const report = await inspectPdf(await build(options({ mode: "single" }), 3));
    expect(report.pageCount).toBe(3);
    for (const box of report.mediaBoxes) {
      expect(box[2]).toBeCloseTo(198.425197, 4);
      expect(box[3]).toBeCloseTo(198.425197, 4);
    }
  });

  it("'single' con sangrado: MediaBox mayor y TrimBox = tamaño de la pieza", async () => {
    const report = await inspectPdf(await build(options({ mode: "single", bleedMm: 2 }), 1));
    expect(report.mediaBoxes[0]?.[2]).toBeCloseTo(mmToPt(74), 4);
    expect(report.trimBoxes[0]?.map((v) => Math.round(v * 1000) / 1000)).toEqual([5.669, 5.669, 204.094, 204.094]);
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
    expect((await inspectPdf(bytes)).pageCount).toBe(167);
    expect(seconds).toBeLessThan(10);
  }, 60_000);
});
