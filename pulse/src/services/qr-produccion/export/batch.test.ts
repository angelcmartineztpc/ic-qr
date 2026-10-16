import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { ExportRequestInput } from "@/services/qr-produccion/schemas/export";

import { EXPORT_BATCH_RECORDS, planBatches, runBatchedExport, type SingleRunner } from "./batch";
import { ExportCancelledError, ExportClientError, runExportJob, type ExportPhase, type ExportResult } from "./client";
import { CHUNK_BYTES, encodeFrame } from "./frames";

const text = (s: string) => new TextEncoder().encode(s);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const records = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));
const request = (n: number, options: Record<string, unknown> = {}) => ({ records: records(n), options: { fileName: "Mesas", formats: ["pdf"], ...options } }) as unknown as ExportRequestInput;
const blobOf = (data: Uint8Array, type: string) => new Blob([data as BlobPart], { type });

describe("planBatches", () => {
  it("reparte en lotes consecutivos y equilibrados, sin dejar uno diminuto", () => {
    expect(planBatches(250, 100)).toEqual([
      { offset: 0, length: 84 },
      { offset: 84, length: 83 },
      { offset: 167, length: 83 },
    ]);
    expect(planBatches(101, 100)).toEqual([
      { offset: 0, length: 51 },
      { offset: 51, length: 50 },
    ]);
  });

  it("cubre todas las piezas exactamente una vez, para cualquier tamaño", () => {
    for (const count of [1, 99, 100, 101, 199, 200, 201, 999, 5000]) {
      const plan = planBatches(count, 100);
      expect(plan.reduce((n, p) => n + p.length, 0)).toBe(count);
      expect(plan.every((p, i) => p.offset === (plan[i - 1] ? plan[i - 1]!.offset + plan[i - 1]!.length : 0))).toBe(true);
      expect(Math.max(...plan.map((p) => p.length))).toBeLessThanOrEqual(100);
    }
    expect(planBatches(0, 100)).toEqual([]);
  });
});

describe("runBatchedExport", () => {
  const pdfRunner = (calls: ExportRequestInput[] = []): SingleRunner => async (part, callbacks) => {
    calls.push(part);
    callbacks.onPhase?.({ phase: "generating", done: part.records.length, total: part.records.length });
    callbacks.onPhase?.({ phase: "preparing", done: part.records.length, total: part.records.length });
    return { files: { pdf: { name: "x.pdf", mime: "application/pdf", blob: blobOf(text(`pdf:${part.options.batch?.offset}`), "application/pdf") } }, done: { pages: part.records.length, pieces: part.records.length, warnings: 1 }, warnings: [{ code: "W", message: `lote ${part.options.batch?.offset}` }] };
  };

  it("cada lote es una llamada con su desplazamiento y el total; el resultado es UN ZIP con un PDF por lote", async () => {
    const calls: ExportRequestInput[] = [];
    const result = await runBatchedExport(request(250), {}, undefined, pdfRunner(calls));
    expect(calls.map((c) => [c.records.length, c.options.batch])).toEqual([
      [84, { offset: 0, total: 250 }],
      [83, { offset: 84, total: 250 }],
      [83, { offset: 167, total: 250 }],
    ]);
    expect(Object.keys(result.files)).toEqual(["zip"]);
    expect(result.files.zip).toMatchObject({ name: "Mesas.zip", mime: "application/zip" });
    const entries = unzipSync(new Uint8Array(await (result.files.zip?.blob as Blob).arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(["Mesas-parte-01.pdf", "Mesas-parte-02.pdf", "Mesas-parte-03.pdf"]);
    expect(decode(entries["Mesas-parte-02.pdf"] as Uint8Array)).toBe("pdf:84");
    expect(result.done).toEqual({ pages: 250, pieces: 250, warnings: 3 });
    expect(result.warnings.map((w) => w.message)).toEqual(["lote 0", "lote 84", "lote 167"]);
  });

  it("el avance de generación se suma entre lotes y las fases finales son del archivo completo", async () => {
    const phases: ExportPhase[] = [];
    await runBatchedExport(request(200), { onPhase: (p) => phases.push(p) }, undefined, pdfRunner());
    expect(phases.filter((p) => p.phase === "generating")).toEqual([
      { phase: "generating", done: 100, total: 200 },
      { phase: "generating", done: 200, total: 200 },
    ]);
    expect(phases.slice(-2).map((p) => p.phase)).toEqual(["preparing", "downloading"]);
    expect(phases.filter((p) => p.phase === "preparing")).toHaveLength(1);
  });

  it("los SVG de cada lote conservan su numeración global y se juntan en el mismo ZIP", async () => {
    const runner: SingleRunner = async (part) => {
      const offset = part.options.batch?.offset ?? 0;
      const files = Object.fromEntries(part.records.map((_, i) => [`${String(offset + i + 1).padStart(3, "0")}.svg`, text("<svg/>")]));
      return { files: { zip: { name: "x.zip", mime: "application/zip", blob: blobOf(zipSync(files), "application/zip") } }, done: { pages: 0, pieces: part.records.length, warnings: 0 }, warnings: [] } satisfies ExportResult;
    };
    const result = await runBatchedExport(request(5, { formats: ["svgZip"] }), {}, undefined, runner, 2);
    const entries = unzipSync(new Uint8Array(await (result.files.zip?.blob as Blob).arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(["001.svg", "002.svg", "003.svg", "004.svg", "005.svg"]);
  });

  it("con un PDF por Estación, cada lote va en su carpeta (el mismo nombre no se pisa)", async () => {
    const runner: SingleRunner = async () => ({ files: { zip: { name: "x.zip", mime: "application/zip", blob: blobOf(zipSync({ "QR_SECCION A_Bar.pdf": text("%PDF") }), "application/zip") } }, done: { pages: 1, pieces: 1, warnings: 0 }, warnings: [] });
    const result = await runBatchedExport(request(4, { pdfBySection: true }), {}, undefined, runner, 2);
    const entries = unzipSync(new Uint8Array(await (result.files.zip?.blob as Blob).arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(["parte-01/QR_SECCION A_Bar.pdf", "parte-02/QR_SECCION A_Bar.pdf"]);
  });

  it("cancelar entre lotes lanza ExportCancelledError y no pide más lotes; un error del servidor sale tal cual", async () => {
    const controller = new AbortController();
    let called = 0;
    const runner: SingleRunner = async (part, cb, signal) => {
      called++;
      controller.abort();
      return pdfRunner()(part, cb, signal);
    };
    await expect(runBatchedExport(request(300), {}, controller.signal, runner)).rejects.toBeInstanceOf(ExportCancelledError);
    expect(called).toBe(1);
    const failing: SingleRunner = async () => {
      throw new ExportClientError("QR_UNRESOLVED", "Falta el QR", [], "r5");
    };
    await expect(runBatchedExport(request(300), {}, undefined, failing)).rejects.toMatchObject({ code: "QR_UNRESOLVED", recordId: "r5" });
  });
});

describe("runExportJob con lotes (a través de fetch)", () => {
  const pdf = new Uint8Array(CHUNK_BYTES + 10).fill(5);
  const response = (pieces: number) => {
    const frames = [
      encodeFrame.progress({ phase: "generating", done: pieces, total: pieces }),
      encodeFrame.fileMeta({ fileId: "pdf", name: "Mesas.pdf", size: pdf.length, mime: "application/pdf" }),
      encodeFrame.fileChunk("pdf", pdf.subarray(0, CHUNK_BYTES)),
      encodeFrame.fileChunk("pdf", pdf.subarray(CHUNK_BYTES)),
      encodeFrame.done({ pages: 1, pieces, warnings: 0 }),
    ];
    const bytes = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
    let o = 0;
    for (const f of frames) (bytes.set(f, o), (o += f.length));
    return new Response(bytes);
  };

  it("hasta el tamaño de lote es UNA llamada (y un PDF); por encima, varias llamadas y un ZIP", async () => {
    const urls: string[] = [];
    const bodies: Array<{ records: unknown[]; options: { batch?: unknown } }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      urls.push(url);
      const body = JSON.parse(String(init.body)) as (typeof bodies)[number];
      bodies.push(body);
      return response(body.records.length);
    }) as unknown as typeof fetch;

    const single = await runExportJob(request(3), {}, undefined, fetchImpl, 5);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.options.batch).toBeUndefined();
    expect(single.files.pdf?.name).toBe("Mesas.pdf");
    expect(urls[0]).toMatch(/\/qr-exportar$/);

    bodies.length = 0;
    const many = await runExportJob(request(11), {}, undefined, fetchImpl, 5);
    expect(bodies.map((b) => b.records.length)).toEqual([4, 4, 3]);
    expect(Object.keys(many.files)).toEqual(["zip"]);
    expect(many.done.pieces).toBe(11);
  });

  it("el tamaño de lote por defecto es el que el servidor admite por llamada", () => {
    expect(EXPORT_BATCH_RECORDS).toBe(100);
  });
});
