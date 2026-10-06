import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { getTemplate } from "@/templates";
import type { PreviewRequest, PreviewTile } from "@/schemas/preview";
import { TemplateOverridesSchema } from "@/schemas/template";

import { HAS_GOTHAM, registry } from "../../../tests/helpers/gotham";
import { MemoryStorage } from "../../../tests/helpers/memory-storage";
import { bytes, ownQrSvg } from "../../../tests/helpers/qr-svg";
import { generatedSource, existingSource, MENU } from "../../../tests/helpers/records";
import { verifyExistingQr } from "../qr/verify-existing";
import { PreviewError, previewQrGeometry, renderPreviewTiles } from "./render-tiles";

const template = getTemplate("tropical-table");
if (!template) throw new Error("falta tropical-table");

const tile = (overrides: Partial<PreviewTile> = {}): PreviewTile => ({
  key: "k1",
  recordId: "r1",
  area: "Tropical",
  estacion: "",
  mesa: "M1",
  subgrupo: "",
  concepto: "",
  menuUrl: MENU,
  qr: { source: "none" },
  ...overrides,
});
const request = (tiles: PreviewTile[], overrides: Partial<PreviewRequest> = {}): PreviewRequest => ({
  templateId: "tropical-table",
  templateOverrides: TemplateOverridesSchema.parse({}),
  layout: { templateId: "tropical-table", base: template.defaultLayout, overrides: {} },
  detail: "full",
  tiles,
  ...overrides,
});

describe("previewQrGeometry — nunca genera ni sube nada", () => {
  const storage = new MemoryStorage();

  it("sin QR aún: vista previa del QR del Link del menú; con link inválido, el marcador (no un código falso)", async () => {
    expect(await previewQrGeometry(tile(), storage)).toMatchObject({ kind: "matrix", modules: 33 });
    expect(await previewQrGeometry(tile({ menuUrl: "hola" }), storage)).toMatchObject({ kind: "external", strokeBased: true });
    expect(await previewQrGeometry(tile({ menuUrl: "" }), storage)).toMatchObject({ kind: "external" });
  });

  it("generado: dibuja su payload, aunque el Link del menú ya haya cambiado (lo que se imprimiría)", async () => {
    const geometry = await previewQrGeometry(tile({ menuUrl: "https://menu.example.com/otro", qr: generatedSource(MENU) }), storage);
    expect(geometry).toMatchObject({ kind: "matrix", modules: 33 });
  });

  it("existente sin verificar o con instantánea ausente: marcador", async () => {
    expect(await previewQrGeometry(tile({ qr: { source: "existing", assetKind: "unknown", verification: "unchecked" } }), storage)).toMatchObject({ kind: "external", nodes: [{ stroke: "#BBBBBB" }] });
    expect(await previewQrGeometry(tile({ qr: existingSource({ snapshotKey: `qr/ext/v1/${"b".repeat(64)}.json` }) }), storage)).toMatchObject({ kind: "external", nodes: [{ stroke: "#BBBBBB" }] });
  });

  it("existente verificado: su instantánea real", async () => {
    const store = new MemoryStorage();
    const verified = await verifyExistingQr("https://qr.cliente.com/m1.svg", { storage: store, keyPrefix: "", now: () => new Date(), fetchRemote: async (url) => ({ bytes: bytes(ownQrSvg(MENU)), contentType: "image/svg+xml", finalUrl: url }) });
    if (!verified.ok) throw new Error(verified.error.message);
    const geometry = await previewQrGeometry(tile({ qr: verified.qr }), store);
    expect(geometry).toMatchObject({ kind: "external", viewBox: [0, 0, 41, 41] });
    expect(store.calls.upload).toBe(1); // solo la instantánea de la verificación, nada en la vista previa
  });

  it("una instantánea de otro archivo o dañada → marcador", async () => {
    const store = new MemoryStorage();
    const key = `qr/ext/v1/${"b".repeat(64)}.json`;
    store.objects.set(key, { body: bytes("{no"), contentType: "application/json", metadata: {} });
    expect(await previewQrGeometry(tile({ qr: existingSource({ snapshotKey: key }) }), store)).toMatchObject({ kind: "external", strokeBased: true });
  });
});

describe.skipIf(!HAS_GOTHAM)("renderPreviewTiles (requiere Gotham: bun run fonts:setup)", () => {
  const deps = { fonts: registry, storage: new MemoryStorage() };

  it("devuelve un SVG por pieza, en contornos, de 50 mm, bien formado y sin texto vivo", async () => {
    const { tiles } = await renderPreviewTiles(request([tile(), tile({ key: "k2", recordId: "r2", mesa: "M2" })]), deps);
    expect(Object.keys(tiles)).toEqual(["k1", "k2"]);
    const svg = tiles["k1"]?.svg ?? "";
    expect(svg).toMatch(/^<svg [^>]*width="50mm" height="50mm" viewBox="0 0 500 500"/);
    expect(svg).not.toMatch(/<text|<image|<script|<style/);
    const errors: string[] = [];
    new DOMParser({ onError: (level, m) => (level === "warning" ? undefined : errors.push(m)) }).parseFromString(svg, "image/svg+xml");
    expect(errors).toEqual([]);
    expect(tiles["k1"]?.svg).not.toBe(tiles["k2"]?.svg);
  });

  it("el texto del usuario nunca inyecta marcado", async () => {
    const { tiles } = await renderPreviewTiles(request([tile({ area: `"><script>alert(1)</script>`, mesa: "<b>1</b>" })]), deps);
    expect(tiles["k1"]?.svg).not.toContain("<script");
  });

  it("aplica los ajustes de plantilla y el layout por pieza", async () => {
    const base = await renderPreviewTiles(request([tile()]), deps);
    const moved = await renderPreviewTiles(request([tile()], { layout: { templateId: "tropical-table", base: template.defaultLayout, overrides: { r1: { qr: { x: 2, y: 24, width: 24, height: 24 } } } } }), deps);
    expect(moved.tiles["k1"]?.svg).not.toBe(base.tiles["k1"]?.svg);
    expect(moved.tiles["k1"]?.svg).toContain('id="qr-background" x="20" y="240"');
    const hidden = await renderPreviewTiles(request([tile()], { templateOverrides: TemplateOverridesSchema.parse({ items: { ctaEn: { hidden: true } } }) }), deps);
    expect(hidden.tiles["k1"]?.svg).not.toContain('id="text-ctaEn"');
  });

  it("devuelve los avisos de composición para mostrarlos en la pieza", async () => {
    const { tiles } = await renderPreviewTiles(request([tile({ area: "Restaurante Tropical Playa Del Carmen Riviera Maya Norte" })]), deps);
    expect(tiles["k1"]?.warnings.map((w) => w.code)).toContain("TEXT_OVERFLOW");
    const emoji = await renderPreviewTiles(request([tile({ key: "e", area: "Bar 😀" })]), deps);
    expect(emoji.tiles["e"]?.warnings).toContainEqual({ code: "MISSING_GLYPH", elementId: "area", char: "😀" });
  });

  it("detalle bajo para miniaturas (mucho más pequeño, sin módulos)", async () => {
    const full = await renderPreviewTiles(request([tile()]), deps);
    const low = await renderPreviewTiles(request([tile()], { detail: "low" }), deps);
    expect((low.tiles["k1"]?.svg.length ?? 0) * 5).toBeLessThan(full.tiles["k1"]?.svg.length ?? 0);
  });

  it("rechaza plantillas desconocidas, desacuerdos y ajustes inválidos con un error claro", async () => {
    await expect(renderPreviewTiles(request([tile()], { templateId: "fantasma", layout: { templateId: "fantasma", base: template.defaultLayout, overrides: {} } }), deps)).rejects.toMatchObject({ code: "UNKNOWN_TEMPLATE" });
    await expect(renderPreviewTiles(request([tile()], { layout: { templateId: "restaurant-default", base: template.defaultLayout, overrides: {} } }), deps)).rejects.toBeInstanceOf(PreviewError);
    await expect(renderPreviewTiles(request([tile()], { templateOverrides: TemplateOverridesSchema.parse({ items: { area: { weight: 300 } } }) }), deps)).rejects.toMatchObject({ code: "INVALID_TEMPLATE" });
  });

  it("48 piezas en una petición caben holgadamente en tiempo", async () => {
    const start = performance.now();
    const { tiles } = await renderPreviewTiles(request(Array.from({ length: 48 }, (_, i) => tile({ key: `k${i}`, recordId: `r${i}`, mesa: `M${i}` }))), deps);
    expect(Object.keys(tiles)).toHaveLength(48);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
