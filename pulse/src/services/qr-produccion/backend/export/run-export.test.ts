import { describe, expect, it } from "vitest";

import { fakeFonts } from "@/services/qr-produccion/test-helpers/fake-font";
import { readFrames, type DonePayload, type Frame } from "@/services/qr-produccion/export/frames";
import { ExportRequestSchema, type ExportRequest } from "@/services/qr-produccion/schemas/export";
import { getTemplate } from "@/services/qr-produccion/templates";
import type { ExportRecord, TileScene } from "@/types";

import { HourlyQuota } from "../qr/quota";
import { resolveGenerate } from "../qr/resolve";
import { MemoryStorage } from "../test-helpers/memory-storage";
import type { PdfSheet, PdfSheetOptions } from "./pdf-port";
import { ExportError, prepareExport, runExport, type ExportDeps } from "./run-export";
import { packGrid } from "@/services/qr-produccion/document/sheet";

const template = getTemplate("tropical-table");
if (!template) throw new Error("falta tropical-table");

/** Escritor falso: cuenta piezas y devuelve unos bytes reconocibles. */
class FakeSheet implements PdfSheet {
  readonly scenes: TileScene[] = [];
  readonly grid;
  constructor(readonly options: PdfSheetOptions) {
    this.grid = packGrid({ tile: options.tile, options: options.pdf });
  }
  add(scene: TileScene) {
    this.scenes.push(scene);
  }
  async finish() {
    return new TextEncoder().encode(`%PDF-fake:${this.scenes.length}`);
  }
}

async function setup(count = 3, estaciones: string[] = []) {
  const storage = new MemoryStorage();
  const items = Array.from({ length: count }, (_, i) => ({ recordId: `r${i}`, menuUrl: `https://menu.example.com/m${i}`, expectedRevision: 0 }));
  const { results } = await resolveGenerate(items, { storage, keyPrefix: "", quota: new HourlyQuota(100), now: () => new Date() });
  const records: ExportRecord[] = results.map((r, i) => {
    if (r.outcome !== "generated" && r.outcome !== "reused") throw new Error("no se generó");
    return { id: `r${i}`, area: "Tropical", estacion: estaciones[i] ?? "", mesa: `M${i}`, subgrupo: "", concepto: "", menuUrl: `https://menu.example.com/m${i}`, qrUrl: r.qrUrl, qr: r.qr };
  });
  const sheets: FakeSheet[] = [];
  const deps: ExportDeps = {
    fonts: { forTemplate: () => fakeFonts },
    storage,
    keyPrefix: "",
    createPdfSheet: (options) => {
      const sheet = new FakeSheet(options);
      sheets.push(sheet);
      return sheet;
    },
  };
  return { storage, records, deps, sheets };
}

function request(records: ExportRecord[], options: Partial<ExportRequest["options"]> = {}): ExportRequest {
  return ExportRequestSchema.parse({
    records,
    templateId: "tropical-table",
    templateOverrides: {},
    layout: { templateId: "tropical-table", base: template!.defaultLayout, overrides: {} },
    options: { fileName: "prueba", formats: ["pdf"], pdf: { mode: "single", pageSize: { kind: "A4" }, orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 }, gapMm: 2, bleedMm: 0, cutLine: "none", includeQrBackground: true, colorSpace: "rgb", textMode: "outlined", center: true }, ...options },
  });
}

async function frames(chunks: Uint8Array[]): Promise<Frame[]> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const out: Frame[] = [];
  for await (const frame of readFrames(stream)) out.push(frame);
  return out;
}

async function run(req: ExportRequest, deps: ExportDeps, signal = new AbortController().signal) {
  const emitted: Uint8Array[] = [];
  const prepared = prepareExport(req, deps);
  const summary = await runExport(req, prepared, deps, signal, (frame) => emitted.push(frame));
  return { summary, frames: await frames(emitted) };
}

const filesOf = (all: Frame[]) => all.flatMap((f) => (f.type === 2 ? [f.payload] : []));
const bytesOf = (all: Frame[], id: "pdf" | "zip") => {
  const parts = all.flatMap((f) => (f.type === 3 && f.fileId === id ? [f.data] : []));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) (out.set(part, offset), (offset += part.length));
  return out;
};

describe("runExport (orquestación; el PDF real se prueba en Deno con pdfkit)", () => {
  it("emite progreso → archivo (meta + trozos con el tamaño exacto) → fin, con una sola hoja de PDF (modo «una pieza por página»)", async () => {
    const { records, deps, sheets } = await setup(3);
    const { summary, frames: all } = await run(request(records), deps);
    expect(all[0]).toMatchObject({ type: 1, payload: { phase: "generating", done: 0, total: 3 } });
    expect(all.some((f) => f.type === 1 && f.payload.phase === "preparing")).toBe(true);
    const [meta] = filesOf(all);
    expect(meta).toMatchObject({ fileId: "pdf", name: "prueba.pdf", mime: "application/pdf" });
    expect(new TextDecoder().decode(bytesOf(all, "pdf"))).toBe("%PDF-fake:3");
    expect(bytesOf(all, "pdf").length).toBe(meta?.size);
    expect(all.at(-1)).toMatchObject({ type: 4, payload: { pieces: 3, pages: 3 } satisfies Partial<DonePayload> });
    expect(sheets).toHaveLength(1);
    expect(summary.pieces).toBe(3);
  });

  it("un PDF por Estación va dentro de un ZIP, en el orden de primera aparición", async () => {
    const { records, deps, sheets } = await setup(3, ["Bar", "Alberca", "Bar"]);
    const { frames: all } = await run(request(records, { pdfBySection: true }), deps);
    expect(sheets).toHaveLength(2);
    expect(sheets.map((s) => s.scenes.length)).toEqual([2, 1]);
    expect(filesOf(all)).toHaveLength(1);
    expect(filesOf(all)[0]).toMatchObject({ fileId: "zip", name: "prueba.zip" });
  });

  it("el ZIP de SVG lleva una entrada por pieza", async () => {
    const { records, deps } = await setup(2);
    const { frames: all } = await run(request(records, { formats: ["svgZip"] }), deps);
    const zip = bytesOf(all, "zip");
    expect([zip[0], zip[1]]).toEqual([0x50, 0x4b]);
    const { unzipSync } = await import("fflate");
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(["001.svg", "002.svg"]);
  });

  it("rechaza ANTES de dibujar un QR cuya identidad no coincide con su archivo (nunca se imprime otro QR)", async () => {
    const { records, deps, sheets } = await setup(2);
    const bad = records.map((r, i) => (i === 1 && r.qr.source === "generated" ? { ...r, qr: { ...r.qr, contentHash: "b".repeat(64) } } : r));
    expect(() => prepareExport(request(bad as ExportRecord[]), deps)).toThrow(ExportError);
    expect(sheets).toHaveLength(0);
  });

  it("con el mismo renderer, el QR se re-codifica y no hace falta leer el archivo del storage", async () => {
    const { records, deps, storage } = await setup(1);
    storage.objects.clear();
    // El renderer es el mismo: el QR se re-codifica sin leer el storage, y el SVG coincide byte a byte.
    await expect(run(request(records), deps)).resolves.toBeDefined();
  });

  it("cancelar detiene el bucle (499) y no emite el archivo", async () => {
    const { records, deps } = await setup(3);
    const controller = new AbortController();
    controller.abort();
    await expect(run(request(records), deps, controller.signal)).rejects.toMatchObject({ code: "EXPORT_CANCELLED", status: 499 });
  });

  it("un tiempo agotado se informa como EXPORT_TIMEOUT (408)", async () => {
    const { records, deps } = await setup(1);
    const signal = AbortSignal.timeout(1);
    await new Promise((r) => setTimeout(r, 10));
    await expect(run(request(records), deps, signal)).rejects.toMatchObject({ code: "EXPORT_TIMEOUT", status: 408 });
  });

  it("la exportación nunca escribe en el storage", async () => {
    const { records, deps, storage } = await setup(2);
    const before = storage.calls.upload;
    await run(request(records, { formats: ["pdf", "svgZip"] }), deps);
    expect(storage.calls.upload).toBe(before);
  });
});
