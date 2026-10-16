import { describe, expect, it } from "vitest";

import { fakeFonts } from "@/services/qr-produccion/test-helpers/fake-font";
import { getTemplate } from "@/services/qr-produccion/templates";

import { runLogo } from "../qr/logo-request";
import { MemoryStorage } from "../test-helpers/memory-storage";
import { runPreview } from "./request";

const template = getTemplate("tropical-table");
if (!template) throw new Error("falta tropical-table");
const deps = { fonts: { forTemplate: () => fakeFonts }, storage: new MemoryStorage() };
const tile = { key: "k", recordId: "r1", area: "Tropical", estacion: "", mesa: "M1", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/a", qr: { source: "none" } };
const request = (overrides: Record<string, unknown> = {}) => ({ templateId: "tropical-table", templateOverrides: {}, layout: { templateId: "tropical-table", base: template!.defaultLayout, overrides: {} }, tiles: [tile], ...overrides });

describe("runPreview", () => {
  it("devuelve un SVG por pieza con la misma clave que pidió el cliente", async () => {
    const { tiles } = await runPreview(request(), deps);
    expect(tiles["k"]?.svg).toMatch(/^<svg /);
  });

  it("una petición inválida es 400 con detalle; una plantilla desconocida, 400 con su mensaje", async () => {
    await expect(runPreview({ tiles: [] }, deps)).rejects.toMatchObject({ status: 400, code: "VALIDATION_FAILED", details: expect.any(Array) });
    await expect(runPreview(request({ templateId: "fantasma", layout: { templateId: "fantasma", base: template!.defaultLayout, overrides: {} } }), deps)).rejects.toMatchObject({ status: 400 });
  });

  it("una fuente ausente es 503 FONTS_MISSING (no un error interno)", async () => {
    const missing = { ...deps, fonts: { forTemplate: () => () => { throw new Error("Falta el archivo de fuente x"); } } };
    await expect(runPreview(request(), missing)).rejects.toMatchObject({ status: 503, code: "FONTS_MISSING" });
  });
});

describe("runLogo", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="#000"/></svg>';
  it("sanea el SVG y devuelve su geometría", () => {
    expect(runLogo(new TextEncoder().encode(svg)).geometry).toMatchObject({ viewBox: [0, 0, 10, 10] });
  });
  it("vacío, con script o con trazos → 400 en español", () => {
    expect(() => runLogo(new Uint8Array())).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() => runLogo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'><script>1</script></svg>"))).toThrowError(expect.objectContaining({ status: 400, message: expect.stringContaining("No se pudo usar el SVG") }));
    expect(() => runLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="#000" fill="none"/></svg>'))).toThrowError(expect.objectContaining({ message: expect.stringContaining("trazo") }));
  });
});
