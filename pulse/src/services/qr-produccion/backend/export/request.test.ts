import { describe, expect, it, vi } from "vitest";

import { readFrames, type Frame } from "@/services/qr-produccion/export/frames";
import { packGrid } from "@/services/qr-produccion/document/sheet";
import { fakeFonts } from "@/services/qr-produccion/test-helpers/fake-font";
import { getTemplate } from "@/services/qr-produccion/templates";
import type { ExportRecord } from "@/types";

import { HourlyQuota } from "../qr/quota";
import { resolveGenerate } from "../qr/resolve";
import { MemoryStorage } from "../test-helpers/memory-storage";
import { createExportStream, parseExportRequest, prepareOrThrow } from "./request";
import type { PdfSheet } from "./pdf-port";
import type { ExportDeps } from "./run-export";

const template = getTemplate("tropical-table");
if (!template) throw new Error("falta tropical-table");
const PDF = { mode: "single", pageSize: { kind: "A4" }, orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 }, gapMm: 2, bleedMm: 0, cutLine: "none", includeQrBackground: true, colorSpace: "rgb", textMode: "outlined", center: true };

async function body(count = 2) {
  const storage = new MemoryStorage();
  const items = Array.from({ length: count }, (_, i) => ({ recordId: `r${i}`, menuUrl: `https://menu.example.com/m${i}`, expectedRevision: 0 }));
  const { results } = await resolveGenerate(items, { storage, keyPrefix: "", quota: new HourlyQuota(100), now: () => new Date() });
  const records: ExportRecord[] = results.map((r, i) => {
    if (r.outcome === "failed" || r.outcome === "existing-ok") throw new Error("no se generó");
    return { id: `r${i}`, area: "T", estacion: "", mesa: `M${i}`, subgrupo: "", concepto: "", menuUrl: `https://menu.example.com/m${i}`, qrUrl: r.qrUrl, qr: r.qr };
  });
  const raw = { records, templateId: "tropical-table", templateOverrides: {}, layout: { templateId: "tropical-table", base: template!.defaultLayout, overrides: {} }, options: { fileName: "x", formats: ["pdf"], pdf: PDF } };
  const deps: ExportDeps = {
    fonts: { forTemplate: () => fakeFonts },
    storage,
    keyPrefix: "",
    createPdfSheet: (options): PdfSheet => ({ grid: packGrid({ tile: options.tile, options: options.pdf }), add: () => undefined, finish: async () => new Uint8Array([37, 80, 68, 70]) }),
  };
  return { raw, deps };
}

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const frames: Frame[] = [];
  for await (const frame of readFrames(stream)) frames.push(frame);
  return frames;
};
const log = () => ({ info: vi.fn(), error: vi.fn() });

describe("parseExportRequest", () => {
  it("un registro inválido se señala con su id para el diálogo de bloqueos", async () => {
    const { raw } = await body();
    const broken = structuredClone(raw) as { records: Array<{ id: string; qr: unknown }> };
    broken.records[1]!.qr = { source: "none" };
    try {
      parseExportRequest(broken, 100);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: "VALIDATION_FAILED", details: [expect.objectContaining({ recordId: "r1" })] });
    }
  });

  it("más piezas que el máximo por llamada se rechazan con el motivo en español", async () => {
    const { raw } = await body(3);
    expect(() => parseExportRequest(raw, 2)).toThrowError(expect.objectContaining({ message: expect.stringContaining("Máximo 2 piezas") }));
    expect(parseExportRequest(raw, 3).records).toHaveLength(3);
  });
});

describe("prepareOrThrow", () => {
  it("convierte un QR que no es el de su archivo en 400 QR_IDENTITY_MISMATCH con el id de la pieza", async () => {
    const { raw, deps } = await body();
    const tampered = structuredClone(raw) as { records: Array<{ qr: { contentHash: string } }> };
    tampered.records[0]!.qr.contentHash = "b".repeat(64);
    expect(() => prepareOrThrow(parseExportRequest(tampered, 100), deps)).toThrowError(expect.objectContaining({ status: 400, code: "QR_IDENTITY_MISMATCH", details: { recordId: "r0" } }));
  });
});

describe("createExportStream", () => {
  it("emite los frames hasta DONE, libera el semáforo una vez y cierra", async () => {
    const { raw, deps } = await body();
    const request = parseExportRequest(raw, 100);
    const release = vi.fn();
    const stream = createExportStream({ request, prepared: prepareOrThrow(request, deps), deps, timeoutMs: 5000, requestId: "req-9", release, log: log() });
    const frames = await collect(stream);
    expect(frames.at(-1)).toMatchObject({ type: 4, payload: { pieces: 2 } });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("un fallo inesperado va como frame ERROR con la referencia y sin filtrar el detalle", async () => {
    const { raw, deps } = await body();
    const request = parseExportRequest(raw, 100);
    const prepared = prepareOrThrow(request, deps);
    const failing: ExportDeps = { ...deps, createPdfSheet: () => ({ grid: packGrid({ tile: template!.tile, options: PDF as never }), add: () => { throw new Error("secreto"); }, finish: async () => new Uint8Array() }) };
    const logger = log();
    const frames = await collect(createExportStream({ request, prepared, deps: failing, timeoutMs: 5000, requestId: "req-9", release: vi.fn(), log: logger }));
    const error = frames.find((f) => f.type === 6);
    expect(error).toMatchObject({ payload: { code: "INTERNAL", requestId: "req-9" } });
    expect(JSON.stringify(error)).not.toContain("secreto");
    expect(logger.error).toHaveBeenCalled();
  });

  it("si el cliente cancela antes de empezar no emite el archivo y no es un error", async () => {
    const { raw, deps } = await body();
    const request = parseExportRequest(raw, 100);
    const client = new AbortController();
    client.abort();
    const logger = log();
    const release = vi.fn();
    const frames = await collect(createExportStream({ request, prepared: prepareOrThrow(request, deps), deps, clientSignal: client.signal, timeoutMs: 5000, requestId: "r", release, log: logger }));
    expect(frames.some((f) => f.type === 2 || f.type === 4 || f.type === 6)).toBe(false);
    expect(logger.info).toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
