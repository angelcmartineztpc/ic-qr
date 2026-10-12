import { describe, expect, it, vi } from "vitest";

import type { PreviewRequestInput, PreviewResponse } from "@/schemas/preview";
import { createEmptyProject } from "@/lib/state/project";
import { getTemplate } from "@/templates";

import { pendingRecord } from "../../../tests/helpers/records";
import { TilePreviewClient, tileInputOf, type TileContext } from "./tile-preview-client";

const project = createEmptyProject("2026-10-06T10:00:00.000Z");
const context = (overrides: Partial<TileContext> = {}): TileContext => ({ templateId: project.templateId, templateOverrides: project.templateOverrides, layout: project.layout, detail: "full", ...overrides });
const tile = (mesa: string, id = `r-${mesa}`) => tileInputOf({ ...pendingRecord({ mesa }, id) });

function client(options?: ConstructorParameters<typeof TilePreviewClient>[1]) {
  const calls: PreviewRequestInput[] = [];
  const fetchTiles = vi.fn(async (request: PreviewRequestInput): Promise<PreviewResponse> => {
    calls.push(request);
    return { tiles: Object.fromEntries(request.tiles.map((t) => [t.key, { svg: `<svg data-mesa="${t.mesa}"/>`, warnings: [] }])) };
  });
  return { client: new TilePreviewClient(fetchTiles, { batchMs: 5, ...options }), calls, fetchTiles };
}

describe("TilePreviewClient", () => {
  it("agrupa en UNA llamada las piezas pedidas en la misma ventana (24 piezas visibles = 1 petición)", async () => {
    const { client: c, calls } = client();
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => c.request(context(), tile(`M${i}`))));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tiles).toHaveLength(24);
    expect(results.map((r) => r.svg)).toEqual(Array.from({ length: 24 }, (_, i) => `<svg data-mesa="M${i}"/>`));
  });

  it("parte los lotes grandes en peticiones de 48 como máximo", async () => {
    const { client: c, calls } = client();
    await Promise.all(Array.from({ length: 100 }, (_, i) => c.request(context(), tile(`M${i}`))));
    expect(calls.map((r) => r.tiles.length).sort((a, b) => a - b)).toEqual([4, 48, 48]);
  });

  it("cachea por contenido: volver a pedir lo mismo no llama al servidor", async () => {
    const { client: c, fetchTiles } = client();
    await c.request(context(), tile("M1"));
    await c.request(context(), tile("M1"));
    expect(fetchTiles).toHaveBeenCalledTimes(1);
    expect(c.peek(context(), tile("M1"))?.svg).toContain("M1");
    expect(c.peek(context(), tile("M2"))).toBeUndefined();
  });

  it("peticiones idénticas simultáneas comparten una sola pieza", async () => {
    const { client: c, calls } = client();
    await Promise.all([c.request(context(), tile("M1")), c.request(context(), tile("M1")), c.request(context(), tile("M1"))]);
    expect(calls[0]?.tiles).toHaveLength(1);
  });

  it("cualquier cambio que altera el dibujo invalida la caché (datos, QR, plantilla, posición)", async () => {
    const { client: c, fetchTiles } = client();
    await c.request(context(), tile("M1"));
    await c.request(context(), tileInputOf(pendingRecord({ mesa: "M1", area: "Otra" }, "r-M1")));
    await c.request(context({ detail: "low" }), tile("M1"));
    const other = getTemplate("restaurant-default");
    if (!other) throw new Error("falta restaurant-default");
    await c.request(context({ templateId: other.id, layout: { templateId: other.id, base: other.defaultLayout, overrides: {} } }), tile("M1"));
    await c.request(context({ layout: { ...project.layout, overrides: { "r-M1": { qr: { x: 1, y: 1, width: 10, height: 10 } } } } }), tile("M1"));
    expect(fetchTiles).toHaveBeenCalledTimes(5);
  });

  it("solo viaja la posición personalizada de las piezas del lote (no las de todo el proyecto)", async () => {
    const { client: c, calls } = client();
    const layout = { ...project.layout, overrides: { "r-M1": { qr: { x: 1, y: 1, width: 10, height: 10 } }, "r-M9": { qr: { x: 2, y: 2, width: 10, height: 10 } } } };
    await c.request(context({ layout }), tile("M1"));
    expect(Object.keys(calls[0]?.layout.overrides ?? {})).toEqual(["r-M1"]);
  });

  it("un fallo rechaza a quien lo esperaba, no se cachea y se puede reintentar", async () => {
    const fetchTiles = vi.fn<(r: PreviewRequestInput) => Promise<PreviewResponse>>().mockRejectedValueOnce(new Error("500")).mockImplementation(async (r) => ({ tiles: Object.fromEntries(r.tiles.map((t) => [t.key, { svg: "<svg/>", warnings: [] }])) }));
    const c = new TilePreviewClient(fetchTiles, { batchMs: 1 });
    await expect(c.request(context(), tile("M1"))).rejects.toThrow("500");
    await expect(c.request(context(), tile("M1"))).resolves.toMatchObject({ svg: "<svg/>" });
    expect(fetchTiles).toHaveBeenCalledTimes(2);
  });

  it("la caché es LRU y está acotada", async () => {
    const { client: c, fetchTiles } = client({ cacheSize: 2 });
    for (const m of ["M1", "M2", "M3"]) await c.request(context(), tile(m));
    expect(c.peek(context(), tile("M1"))).toBeUndefined(); // expulsada
    expect(c.peek(context(), tile("M3"))).toBeDefined();
    expect(fetchTiles).toHaveBeenCalledTimes(3);
  });

  it("tileInputOf solo incluye lo que cambia el dibujo", () => {
    const input = tileInputOf(pendingRecord({}, "r1"));
    expect(Object.keys(input).sort()).toEqual(["area", "concepto", "estacion", "menuUrl", "mesa", "qr", "recordId", "subgrupo"]);
  });
});
