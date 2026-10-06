import { describe, expect, it } from "vitest";

import { getTemplate } from "@/templates";
import type { QrGeometry, Template } from "@/types";

import { fakeFonts } from "../../../tests/helpers/fake-font";
import { encodeMatrix } from "@/lib/qr/encode";
import { outlineScene } from "./outline";
import { buildScene, type SceneRecord } from "./scene";

const tropical = (): Template => {
  const t = getTemplate("tropical-table");
  if (!t) throw new Error("falta tropical-table");
  return t;
};
const record = (o: Partial<SceneRecord> = {}): SceneRecord => ({ id: "r1", area: "Tropical", estacion: "Bar", mesa: "M1", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/tropical", ...o });
const geometry = (payload: string): QrGeometry => {
  const matrix = encodeMatrix(payload);
  return { kind: "matrix", matrix, modules: matrix.length };
};
const build = (r = record(), template = tropical(), options?: Parameters<typeof buildScene>[0]["options"]) =>
  buildScene({ template, layout: template.defaultLayout, record: r, qr: geometry(r.menuUrl), fonts: fakeFonts, ...(options ? { options } : {}) });

describe("buildScene — TropicalTable", () => {
  it("pieza de 50 × 50 mm con las capas en orden: fondo, QR y texto", () => {
    const scene = build();
    expect(scene).toMatchObject({ widthMm: 50, heightMm: 50, meta: { recordId: "r1", templateId: "tropical-table", templateVersion: "1.0.0" } });
    expect(scene.nodes.map((n) => n.layer)).toEqual(["background", "qr", "qr", "text", "text", "text", "text", "text"]);
  });

  it("imprime solo Área, la etiqueta, Mesa y los dos textos; Estación es metadato (§1.2-8)", () => {
    const texts = build().nodes.flatMap((n) => (n.type === "text" ? [n.text] : []));
    expect(texts).toEqual(["TROPICAL", "MESA – TABLE", "M1", "CONSULTA EL MENÚ Y ORDENA EN LÍNEA", "LOOK AT THE MENU AND ORDER ONLINE"]);
  });

  it("el QR queda dentro de su caja de 24 mm y ocupa un solo path con el fondo blanco aparte", () => {
    const scene = build();
    const qrPaths = scene.nodes.filter((n) => n.type === "path" && n.layer === "qr");
    expect(qrPaths).toHaveLength(1);
    const background = scene.nodes.find((n) => n.id === "qr-background");
    expect(background).toMatchObject({ x: 13, y: 24, w: 24, h: 24 });
  });

  it("los ids son únicos", () => {
    const ids = build().nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("centra cada línea en la caja del bloque (x = 4 + (42 − ancho)/2)", () => {
    for (const node of build().nodes) {
      if (node.type !== "text") continue;
      expect(node.xMm + node.widthMm / 2).toBeCloseTo(25, 2);
    }
  });

  it("apila con la métrica de mayúscula: base = y + cap·tamaño; la siguiente deja marginTop (§E.11)", () => {
    const texts = build().nodes.filter((n) => n.type === "text");
    const [area, label] = texts;
    if (area?.type !== "text" || label?.type !== "text") throw new Error("faltan líneas");
    // Fuente falsa: cap = 0.7 em → 13 pt × 0.352778 × 0.7 = 3.2102 mm bajo y = 3.
    expect(area.baselineMm).toBeCloseTo(3 + 13 * 0.352778 * 0.7, 2);
    // label: parte alta = base anterior + 1.6; su base = parte alta + 6 pt × cap.
    expect(label.baselineMm).toBeCloseTo(area.baselineMm + 1.6 + 6 * 0.352778 * 0.7, 2);
  });

  it("encoge el Área larga hasta caber y avisa si ni así cabe", () => {
    const short = build(record({ area: "Bar" })).nodes.find((n) => n.id === "text-area");
    const long = build(record({ area: "Terraza Playa Sur" })).nodes.find((n) => n.id === "text-area");
    const huge = build(record({ area: "Restaurante Tropical Playa Del Carmen Riviera" }));
    if (short?.type !== "text" || long?.type !== "text") throw new Error("falta el Área");
    expect(short.sizePt).toBe(13);
    expect(long.sizePt).toBeLessThan(13);
    expect(long.widthMm).toBeLessThanOrEqual(42 + 1e-6);
    expect(huge.warnings).toContainEqual({ code: "TEXT_OVERFLOW", elementId: "area", axis: "x" });
  });

  it("oculta las líneas cuyos campos están vacíos (hideWhenEmpty)", () => {
    const template = getTemplate("restaurant-default");
    if (!template) throw new Error("falta restaurant-default");
    const texts = build(record({ estacion: "", subgrupo: "", concepto: "" }), template).nodes.flatMap((n) => (n.type === "text" ? [n.id] : []));
    expect(texts).toEqual(["text-area", "text-mesa", "text-cta"]);
  });

  it("avisa de caracteres sin glifo", () => {
    expect(build(record({ area: "Bar 😀" })).warnings).toContainEqual({ code: "MISSING_GLYPH", elementId: "area", char: "😀" });
  });

  it("avisa cuando el módulo del QR es demasiado pequeño (política de densidad)", () => {
    const dense = build(record({ menuUrl: `https://menu.example.com/${"a".repeat(80)}` }));
    expect(dense.warnings.some((w) => w.code === "QR_MODULE_SMALL")).toBe(true);
    expect(build().warnings.some((w) => w.code === "QR_MODULE_SMALL")).toBe(false);
  });

  it("opciones: sin fondo del QR, línea de corte y sangrado", () => {
    const noBg = build(record(), tropical(), { includeQrBackground: false });
    expect(noBg.nodes.some((n) => n.id === "qr-background")).toBe(false);
    expect(noBg.warnings).toContainEqual({ code: "QR_NO_WHITE_BACKGROUND" });

    const dieline = build(record(), tropical(), { cutLine: "spot", bleedMm: 2 });
    expect(dieline.nodes.at(-1)).toMatchObject({ layer: "cutline", id: "cutline-outline", w: 50, h: 50 });
    expect(dieline.nodes[0]).toMatchObject({ x: -2, y: -2, w: 54, h: 54 });
  });
});

describe("outlineScene", () => {
  it("convierte todo el texto a paths y conserva el texto original como título", () => {
    const outlined = outlineScene(build(), fakeFonts);
    expect(outlined.nodes.some((n) => n.type === "text")).toBe(false);
    const area = outlined.nodes.find((n) => n.id === "text-area");
    expect(area).toMatchObject({ type: "path", layer: "text", title: "TROPICAL", fillRule: "nonzero" });
    if (area?.type !== "path") throw new Error("se esperaba un path");
    expect(area.d).toMatch(/^[MLQCZ0-9. -]+$/);
    expect((area.d.match(/Z/g) ?? []).length).toBe(8); // TROPICAL: un contorno por letra
  });
});
