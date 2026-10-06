import { describe, expect, it } from "vitest";

import { isSupportedChar, SUPPORTED_CHARSET } from "@/lib/document/charset";
import { outlineScene } from "@/lib/document/outline";
import { measureLine } from "@/lib/document/text/engine";
import { getTemplate, listTemplates } from "@/templates";

import { HAS_GOTHAM, registry, sampleScene, tropical } from "../../../tests/helpers/gotham";

describe.skipIf(!HAS_GOTHAM)("Gotham real (requiere bun run fonts:setup)", () => {
  it("todas las plantillas cargan sus pesos declarados", () => {
    for (const template of listTemplates()) {
      const resolver = registry.forTemplate(template);
      for (const font of template.fonts) expect(resolver(font).unitsPerEm).toBe(1000);
    }
  });

  it("un peso no declarado por la plantilla falla con un error claro", () => {
    expect(() => registry.forTemplate(tropical())({ family: "Gotham", weight: 300, style: "normal" })).toThrow(/no declarada/);
  });

  it("cubre todo el juego de caracteres admitido (español, raya, comillas, €)", () => {
    const font = registry.forTemplate(tropical())({ family: "Gotham", weight: 700, style: "normal" });
    const missing = [...SUPPORTED_CHARSET].filter((c) => !font.hasGlyph(c.codePointAt(0) ?? 0));
    expect(missing).toEqual([]);
    expect(isSupportedChar("Ú")).toBe(true);
  });

  it("presupuesto vertical de §E.11 con Gotham: las cinco líneas caben en la caja de 42 × 20 mm", () => {
    const scene = sampleScene({ area: "Tropical", mesa: "M1" });
    const texts = scene.nodes.flatMap((n) => (n.type === "text" ? [n] : []));
    expect(texts).toHaveLength(5);
    for (const t of texts) expect(t.widthMm).toBeLessThanOrEqual(42);
    const last = texts.at(-1);
    expect((last?.baselineMm ?? 99) - 3).toBeLessThanOrEqual(20);
    expect(scene.warnings).toEqual([]);
    // Primera línea: parte alta de la mayúscula en y = 3 mm (cap 700/1000).
    const area = texts[0];
    expect((area?.baselineMm ?? 0) - 13 * 0.352778 * 0.7).toBeCloseTo(3, 2);
  });

  it("los textos de 5 pt son los más estrechos que caben (línea ES ≈ 38 mm)", () => {
    const font = registry.forTemplate(tropical())({ family: "Gotham", weight: 700, style: "normal" });
    const width = measureLine(font, "CONSULTA EL MENÚ Y ORDENA EN LÍNEA", 5, 0);
    expect(width).toBeGreaterThan(30);
    expect(width).toBeLessThan(42);
  });

  it("los contornos de texto coinciden con la medida del motor (centrado exacto)", () => {
    const scene = sampleScene();
    const outlined = outlineScene(scene, registry.forTemplate(tropical()));
    expect(outlined.nodes.filter((n) => n.layer === "text").every((n) => n.type === "path" && n.d.length > 20)).toBe(true);
    for (const node of scene.nodes) if (node.type === "text") expect(node.xMm + node.widthMm / 2).toBeCloseTo(25, 2);
  });

  it("restaurant-default también construye sin avisos con todos los campos", () => {
    const template = getTemplate("restaurant-default");
    if (!template) throw new Error("falta restaurant-default");
    const scene = sampleScene({ estacion: "Bar", subgrupo: "Terraza", concepto: "Comida" }, undefined, template);
    expect(scene.warnings).toEqual([]);
  });

  it("acentos y raya: los glifos existen (Ú, Í, Ñ, –) y producen contorno", () => {
    const font = registry.forTemplate(tropical())({ family: "Gotham", weight: 700, style: "normal" });
    for (const char of "ÚÍÑ–") {
      const [glyph] = font.shape(char);
      expect(glyph?.outline().length ?? 0).toBeGreaterThan(0);
    }
  });
});
