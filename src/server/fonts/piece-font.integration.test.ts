import { describe, expect, it } from "vitest";

import { isSupportedChar, SUPPORTED_CHARSET } from "@/lib/document/charset";
import { outlineScene } from "@/lib/document/outline";
import { measureLine } from "@/lib/document/text/engine";
import { getTemplate, listTemplates } from "@/templates";

import { HAS_PIECE_FONT, registry, sampleScene, tropical } from "../../../tests/helpers/piece-font";

describe.skipIf(!HAS_PIECE_FONT)("Address Sans Pro Cd real (requiere bun run fonts:setup)", () => {
  it("todas las plantillas cargan sus pesos declarados", () => {
    for (const template of listTemplates()) {
      const resolver = registry.forTemplate(template);
      for (const font of template.fonts) expect(resolver(font).unitsPerEm).toBe(1000);
    }
  });

  it("un peso no declarado por la plantilla falla con un error claro", () => {
    expect(() => registry.forTemplate(tropical())({ family: "Address Sans Pro Cd", weight: 300, style: "normal" })).toThrow(/no declarada/);
  });

  it("cubre todo el juego de caracteres admitido (español, raya, comillas, €)", () => {
    const font = registry.forTemplate(tropical())({ family: "Address Sans Pro Cd", weight: 600, style: "normal" });
    const missing = [...SUPPORTED_CHARSET].filter((c) => !font.hasGlyph(c.codePointAt(0) ?? 0));
    expect(missing).toEqual([]);
    expect(isSupportedChar("Ú")).toBe(true);
  });

  /**
   * Medidas tomadas del PDF de referencia (QR_Tropical_1M_Alimentos.pdf, Illustrator) con pdf.js:
   * base de cada línea y centro horizontal, en mm desde la esquina superior izquierda de 70 × 70 mm.
   */
  it("la pieza coincide con la referencia: 70 × 70 mm, bases y centros de cada línea, QR de 33 módulos de 0.751 mm", () => {
    const template = tropical();
    expect(template.tile).toMatchObject({ width: 70, height: 70 });
    const scene = sampleScene({ area: "Tropical", mesa: "M1", menuUrl: "https://menu.example.com/tropical/restaurant?m=1" });
    expect(scene.warnings).toEqual([]);
    const texts = scene.nodes.flatMap((n) => (n.type === "text" ? [n] : []));
    const reference = [
      { text: "TROPICAL", baseline: 9.691, sizePt: 17 },
      { text: "MESA – TABLE", baseline: 14.676, sizePt: 11 },
      { text: "M1", baseline: 21.804, sizePt: 22 },
      { text: "CONSULTA EL MENU Y ORDENA EN LÍNEA", baseline: 30.1, sizePt: 13.2 },
      { text: "LOOK AT THE MENU AN ORDER ON LINE", baseline: 34.9, sizePt: 13.2 },
    ];
    expect(texts.map((t) => t.text)).toEqual(reference.map((r) => r.text));
    texts.forEach((t, i) => {
      expect(Math.abs(t.baselineMm - (reference[i]?.baseline ?? 0))).toBeLessThan(0.03);
      expect(t.sizePt).toBe(reference[i]?.sizePt);
      expect(Math.abs(t.xMm + t.widthMm / 2 - 35)).toBeLessThan(0.15);
    });
    const qr = scene.nodes.find((n) => n.id === "qr-background");
    expect(qr).toMatchObject({ x: 22.606, y: 39.424, w: 24.788 });
    const frame = scene.nodes.find((n) => n.id === "frame");
    expect(frame).toMatchObject({ type: "rect" });
  });

  it("la tinta de la referencia es #2C2E35 en texto, QR y marco", () => {
    const scene = sampleScene();
    const outlined = JSON.stringify(outlineScene(scene, registry.forTemplate(tropical())).nodes);
    expect(outlined).toContain("2C2E35");
    expect(outlined).not.toContain('"#000000"');
  });

  it("la línea ES de la referencia mide ≈ 54 mm a 13.2 pt (tracking −25) y cabe en la pieza", () => {
    const font = registry.forTemplate(tropical())({ family: "Address Sans Pro Cd", weight: 600, style: "normal" });
    const width = measureLine(font, "CONSULTA EL MENU Y ORDENA EN LÍNEA", 13.2, -25);
    expect(width).toBeGreaterThan(52);
    expect(width).toBeLessThan(56);
  });

  it("los contornos de texto coinciden con la medida del motor (centrado exacto)", () => {
    const scene = sampleScene();
    const outlined = outlineScene(scene, registry.forTemplate(tropical()));
    expect(outlined.nodes.filter((n) => n.layer === "text").every((n) => n.type === "path" && n.d.length > 20)).toBe(true);
    for (const node of scene.nodes) if (node.type === "text") expect(Math.abs(node.xMm + node.widthMm / 2 - 35)).toBeLessThan(0.15);
  });

  it("restaurant-default también construye sin avisos con todos los campos", () => {
    const template = getTemplate("restaurant-default");
    if (!template) throw new Error("falta restaurant-default");
    const scene = sampleScene({ estacion: "Bar", subgrupo: "Terraza", concepto: "Comida" }, undefined, template);
    expect(scene.warnings).toEqual([]);
  });

  it("acentos y raya: los glifos existen (Ú, Í, Ñ, –) y producen contorno", () => {
    const font = registry.forTemplate(tropical())({ family: "Address Sans Pro Cd", weight: 600, style: "normal" });
    for (const char of "ÚÍÑ–") {
      const [glyph] = font.shape(char);
      expect(glyph?.outline().length ?? 0).toBeGreaterThan(0);
    }
  });
});
