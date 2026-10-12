import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { outlineScene } from "@/lib/document/outline";
import { buildScene, type SceneRecord } from "@/lib/document/scene";
import { encodeMatrix } from "@/lib/qr/encode";
import type { Template, TileScene } from "@/types";

import { legacyTile } from "../../../tests/helpers/legacy-tile";
import { fakeFonts } from "../../../tests/helpers/fake-font";
import { escapeXml, xmlText } from "./escape";
import { renderSceneSvg, scalePath } from "./render-scene";

const template = (): Template => legacyTile();
const scene = (overrides: Partial<SceneRecord> = {}, options?: Parameters<typeof buildScene>[0]["options"]): TileScene => {
  const record: SceneRecord = { id: "r1", area: "Tropical", estacion: "", mesa: "M1", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/tropical", ...overrides };
  const matrix = encodeMatrix(record.menuUrl);
  return buildScene({ template: template(), layout: template().defaultLayout, record, qr: { kind: "matrix", matrix, modules: matrix.length }, fonts: fakeFonts, ...(options ? { options } : {}) });
};

function parse(svg: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (_level, message) => errors.push(message) }).parseFromString(svg, "image/svg+xml");
  expect(errors).toEqual([]);
  return doc as unknown as Document;
}

const outlined = (overrides?: Partial<SceneRecord>) => outlineScene(scene(overrides), fakeFonts);

describe("renderSceneSvg (spec §17)", () => {
  it("<svg width=50mm height=50mm viewBox='0 0 500 500'> y es XML bien formado", () => {
    const svg = renderSceneSvg(outlined());
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" version="1\.1" width="50mm" height="50mm" viewBox="0 0 500 500">/);
    const root = parse(svg).documentElement;
    expect(root.getAttribute("width")).toBe("50mm");
    expect(root.getAttribute("viewBox")).toBe("0 0 500 500");
  });

  it("una capa <g id> por capa (Illustrator las importa como capas) y todos los ids son únicos", () => {
    const doc = parse(renderSceneSvg(outlined()));
    const groups = Array.from(doc.getElementsByTagName("g")).map((g) => g.getAttribute("id"));
    expect(groups).toEqual(["background", "qr", "text"]);
    const ids = Array.from(doc.getElementsByTagName("*")).map((el) => el.getAttribute("id")).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("solo geometría estándar: sin imágenes, estilos, scripts, use, foreignObject ni fuentes web", () => {
    const svg = renderSceneSvg(outlined());
    expect(svg).not.toMatch(/<image|<style|<script|<use|<foreignObject|<text|@font-face|href=|xlink|data:|onload|javascript:/i);
  });

  it("el QR es un único <path> compuesto y el texto va en contornos con su título", () => {
    const doc = parse(renderSceneSvg(outlined()));
    expect(doc.getElementById("qr-code")?.tagName).toBe("path");
    expect(doc.getElementById("qr-code")?.getAttribute("fill-rule")).toBe("evenodd");
    const area = doc.getElementById("text-area");
    expect(area?.getElementsByTagName("title")[0]?.textContent).toBe("TROPICAL");
  });

  it("las coordenadas están en décimas de mm: el QR de 24 mm en (13, 24) ocupa 240 en (130, 240)", () => {
    const svg = renderSceneSvg(outlined());
    expect(svg).toContain('<rect id="qr-background" x="130" y="240" width="240" height="240" fill="#FFFFFF"/>');
  });

  it("texto vivo: <text> con familia, peso y posición (la fuente debe estar instalada al abrirlo)", () => {
    const doc = parse(renderSceneSvg(scene()));
    const text = doc.getElementById("text-area");
    expect(text?.tagName).toBe("text");
    expect(text?.getAttribute("font-family")).toBe("Gotham");
    expect(text?.getAttribute("font-weight")).toBe("800");
    expect(text?.textContent).toBe("TROPICAL");
  });

  it("es determinista", () => {
    expect(renderSceneSvg(outlined())).toBe(renderSceneSvg(outlined()));
  });

  it("bajo detalle (miniaturas): rectángulos en lugar de módulos y glifos", () => {
    const low = renderSceneSvg(scene(), { detail: "low" });
    const full = renderSceneSvg(outlined());
    expect(low).not.toContain("<path");
    expect(low.length).toBeLessThan(full.length / 5);
  });

  it("margen para el editor: viewBox ampliado y sin width/height fijos", () => {
    expect(renderSceneSvg(outlined(), { marginMm: 8 })).toMatch(/^<svg [^>]*viewBox="-80 -80 660 660"/);
  });
});

describe("texto hostil (spec §31)", () => {
  it("nada del usuario puede inyectar elementos ni atributos", () => {
    const evil = `"><script>alert(1)</script><svg onload="x"`;
    for (const svg of [renderSceneSvg(scene({ area: evil }), { title: evil }), renderSceneSvg(outlined({ area: evil }), { title: evil })]) {
      const doc = parse(svg);
      // El texto hostil queda como texto escapado: ningún elemento script ni atributo de evento.
      expect(doc.getElementsByTagName("script")).toHaveLength(0);
      expect(svg).not.toContain("<script");
      const attributes = Array.from(doc.getElementsByTagName("*")).flatMap((el) => Array.from(el.attributes).map((a) => a.name));
      expect(attributes.some((name) => name.startsWith("on"))).toBe(false);
      expect(Array.from(doc.getElementsByTagName("svg"))).toHaveLength(1);
    }
  });

  it("escapeXml / xmlText", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
    expect(xmlText("a\u0000b\u000Bc")).toBe("abc");
  });
});

describe("scalePath", () => {
  it("escala solo comandos absolutos y redondea", () => {
    expect(scalePath("M1.5 2L3 4.123Z")).toBe("M15 20L30 41.23Z");
    expect(() => scalePath("M0 0h5")).toThrow();
    expect(() => scalePath("M0 0A5 5 0 0 1 1 1")).toThrow();
  });
});
