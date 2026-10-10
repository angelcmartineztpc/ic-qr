import { describe, expect, it } from "vitest";

import { TextElementSchema } from "@/schemas/template";
import { PT_TO_MM } from "@/lib/units";
import type { TextElement } from "@/types";

import { FakeFont } from "../../../../tests/helpers/fake-font";
import { findUnsupportedChars, isSupportedChar } from "../charset";
import { applyTransform, fitText, measureLine, missingGlyphs, resolveText } from "./engine";

const font = new FakeFont(); // 0.6 em por carácter
const element = (overrides: Record<string, unknown> = {}): TextElement =>
  TextElementSchema.parse({ type: "text", id: "t", text: "x", font: { family: "F", weight: 400 }, sizePt: 10, ...overrides });

describe("measureLine", () => {
  it("ancho = Σ avances × tamaño (mm) + tracking entre glifos", () => {
    // 10 caracteres × 0.6 em × 10 pt × 0.352778 = 21.167 mm
    expect(measureLine(font, "abcdefghij", 10, 0)).toBeCloseTo(21.1667, 3);
    // tracking 100/1000 em × 10 pt = 1 pt = 0.3528 mm × 9 huecos
    expect(measureLine(font, "abcdefghij", 10, 100)).toBeCloseTo(21.1667 + 9 * 0.352778, 3);
  });

  it("texto vacío mide 0 y un glifo no lleva tracking", () => {
    expect(measureLine(font, "", 10, 500)).toBe(0);
    expect(measureLine(font, "a", 10, 500)).toBeCloseTo(0.6 * 10 * PT_TO_MM, 6);
  });
});

describe("fitText", () => {
  it("none: no cambia el tamaño y avisa si desborda", () => {
    const result = fitText(font, "abcdefghij", element({ fit: { mode: "none" } }), 10);
    expect(result).toMatchObject({ sizePt: 10, overflowX: true, lines: ["abcdefghij"] });
  });

  it("shrink: reduce hasta que cabe, nunca por debajo del mínimo", () => {
    const fitted = fitText(font, "abcdefghij", element({ fit: { mode: "shrink", minSizePt: 5 } }), 15);
    expect(fitted.overflowX).toBe(false);
    expect(fitted.sizePt).toBeLessThan(10);
    expect(fitted.sizePt).toBeGreaterThanOrEqual(5);
    expect(fitted.widthMm).toBeLessThanOrEqual(15 + 1e-9);

    const tooLong = fitText(font, "abcdefghijklmnopqrst", element({ fit: { mode: "shrink", minSizePt: 8 } }), 15);
    expect(tooLong).toMatchObject({ sizePt: 8, overflowX: true });
  });

  it("shrink: si ya cabe conserva el tamaño original", () => {
    expect(fitText(font, "abc", element({ fit: { mode: "shrink", minSizePt: 5 } }), 40)).toMatchObject({ sizePt: 10, overflowX: false });
  });

  it("wrap: parte por palabras en las líneas permitidas", () => {
    const fitted = fitText(font, "uno dos tres cuatro", element({ fit: { mode: "wrap", maxLines: 2, prefer: "wrap" } }), 25);
    expect(fitted.lines.length).toBeGreaterThan(1);
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
    expect(fitted.lines.join(" ")).toBe("uno dos tres cuatro");
    expect(fitted.overflowX).toBe(false);
  });
});

describe("resolveText", () => {
  const values = { area: "Tropical", mesa: "M1", estacion: "" };
  it("sustituye {{campos}} y colapsa espacios", () => {
    expect(resolveText("{{area}} · {{ mesa }}", values).text).toBe("Tropical · M1");
  });
  it("detecta cuando todos los campos están vacíos (la línea se oculta)", () => {
    expect(resolveText("{{estacion}}", values)).toMatchObject({ text: "", allEmpty: true });
    expect(resolveText("MESA – TABLE", values)).toMatchObject({ hadPlaceholders: false, allEmpty: false });
    expect(resolveText("{{estacion}} · {{subgrupo}}", values).allEmpty).toBe(true);
    expect(resolveText("{{area}} {{estacion}}", values).allEmpty).toBe(false);
  });
  it("mayúsculas con reglas del español", () => {
    expect(applyTransform("menú ñandú", "uppercase")).toBe("MENÚ ÑANDÚ");
    expect(applyTransform("menú", "none")).toBe("menú");
  });
});

describe("caracteres admitidos", () => {
  it("español y raya larga sí; emoji y CJK no", () => {
    for (const char of "áéíóúñüÁÉÍÓÚÑÜ¿¡–—'\"€") expect(isSupportedChar(char)).toBe(true);
    expect(findUnsupportedChars("Terraza 😀 山")).toEqual(["😀", "山"]);
  });
  it("missingGlyphs une los fuera de juego y los que la fuente no tiene", () => {
    expect(missingGlyphs(font, "Mesa 😀")).toEqual(["😀"]);
    expect(missingGlyphs(font, "Mesa")).toEqual([]);
  });
});
