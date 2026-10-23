import { describe, expect, it } from "vitest";

import { ExportCancelledError, ExportClientError, runExportJob, type ExportPhase } from "./client";
import { CHUNK_BYTES, encodeFrame } from "./frames";

const REQUEST = {} as never;
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const streamOf = (frames: Uint8Array[], options: { cut?: number; error?: boolean } = {}) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = concat(frames);
      controller.enqueue(options.cut === undefined ? bytes : bytes.subarray(0, options.cut));
      if (options.error) controller.error(new TypeError("network error"));
      else controller.close();
    },
  });
const ok = (body: ReadableStream<Uint8Array>) => (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

const pdf = new Uint8Array(CHUNK_BYTES + 100).fill(7);
const complete = () => [
  encodeFrame.progress({ phase: "generating", done: 0, total: 2 }),
  encodeFrame.warning({ recordId: "r1", code: "QR_MODULE_SMALL", message: "Módulos pequeños" }),
  encodeFrame.progress({ phase: "generating", done: 2, total: 2 }),
  encodeFrame.progress({ phase: "preparing", done: 2, total: 2 }),
  encodeFrame.fileMeta({ fileId: "pdf", name: "Mesas.pdf", size: pdf.length, mime: "application/pdf" }),
  encodeFrame.fileChunk("pdf", pdf.subarray(0, CHUNK_BYTES)),
  encodeFrame.fileChunk("pdf", pdf.subarray(CHUNK_BYTES)),
  encodeFrame.done({ pages: 1, pieces: 2, warnings: 1 }),
];

describe("runExportJob", () => {
  it("recorre las fases reales, junta los trozos en un Blob y devuelve DONE y los avisos", async () => {
    const phases: ExportPhase[] = [];
    const result = await runExportJob(REQUEST, { onPhase: (p) => phases.push(p) }, undefined, ok(streamOf(complete())));
    expect(phases.map((p) => p.phase)).toEqual(["generating", "generating", "preparing", "downloading", "downloading", "downloading"]);
    expect(phases.at(-1)).toEqual({ phase: "downloading", bytes: pdf.length, size: pdf.length, file: "pdf" });
    expect(result.done).toEqual({ pages: 1, pieces: 2, warnings: 1 });
    expect(result.warnings).toEqual([{ recordId: "r1", code: "QR_MODULE_SMALL", message: "Módulos pequeños" }]);
    const file = result.files.pdf;
    expect(file).toMatchObject({ name: "Mesas.pdf", mime: "application/pdf" });
    expect(file?.blob.size).toBe(pdf.length);
    expect(new Uint8Array(await (file?.blob as Blob).arrayBuffer())).toEqual(pdf);
  });

  it("un stream que termina sin DONE ni ERROR es «La descarga se interrumpió» (STREAM_TRUNCATED)", async () => {
    const withoutDone = complete().slice(0, -1);
    await expect(runExportJob(REQUEST, {}, undefined, ok(streamOf(withoutDone)))).rejects.toMatchObject({ code: "STREAM_TRUNCATED", message: "La descarga se interrumpió" });
  });

  it("cortado a mitad de un frame, o con el archivo incompleto, también es STREAM_TRUNCATED", async () => {
    const bytes = concat(complete()).length;
    await expect(runExportJob(REQUEST, {}, undefined, ok(streamOf(complete(), { cut: bytes - 40 })))).rejects.toMatchObject({ code: "STREAM_TRUNCATED" });
    const short = [...complete().slice(0, 5), encodeFrame.done({ pages: 1, pieces: 2, warnings: 0 })]; // meta dice N bytes, llegan 0
    await expect(runExportJob(REQUEST, {}, undefined, ok(streamOf(short)))).rejects.toMatchObject({ code: "STREAM_TRUNCATED" });
  });

  it("un error de red a mitad del stream es STREAM_TRUNCATED; sin conexión desde el principio es NETWORK con un mensaje útil", async () => {
    await expect(runExportJob(REQUEST, {}, undefined, ok(streamOf(complete().slice(0, 3), { error: true })))).rejects.toMatchObject({ code: "STREAM_TRUNCATED" });
    const offline = (async () => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;
    await expect(runExportJob(REQUEST, {}, undefined, offline)).rejects.toMatchObject({ code: "NETWORK" });
    expect(await runExportJob(REQUEST, {}, undefined, offline).catch((e: Error) => e.message)).toContain("Revisa tu conexión");
  });

  it("un frame ERROR lleva el código, el mensaje y la pieza del servidor", async () => {
    const frames = [encodeFrame.progress({ phase: "generating", done: 0, total: 1 }), encodeFrame.error({ code: "QR_UNRESOLVED", message: "La instantánea ya no existe", requestId: "q1", recordId: "r9" })];
    const error = await runExportJob(REQUEST, {}, undefined, ok(streamOf(frames))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExportClientError);
    expect(error).toMatchObject({ code: "QR_UNRESOLVED", recordId: "r9", requestId: "q1" });
  });

  it("respuestas HTTP de error: 400 con las piezas que bloquean, 429, 503 y cuerpos sin JSON", async () => {
    const json = (status: number, body: unknown) => (async () => Response.json(body, { status })) as unknown as typeof fetch;
    const blocked = await runExportJob(REQUEST, {}, undefined, json(400, { code: "VALIDATION_FAILED", message: "La exportación no es válida", requestId: "q", details: [{ path: "records.1.qr", message: "QR no resuelto", recordId: "b" }, { path: "templateId", message: "x" }] })).catch((e: unknown) => e);
    expect(blocked).toMatchObject({ code: "NOT_VALID", details: [{ recordId: "b", message: "QR no resuelto" }], recordId: "b" });
    await expect(runExportJob(REQUEST, {}, undefined, json(429, { code: "RATE_LIMITED", message: "Demasiadas solicitudes; vuelve a intentarlo en 5 s", requestId: "q" }))).rejects.toMatchObject({ code: "RATE_LIMITED", message: "Demasiadas solicitudes; vuelve a intentarlo en 5 s" });
    await expect(runExportJob(REQUEST, {}, undefined, json(503, { code: "FONTS_MISSING", message: "Faltan las fuentes", requestId: "q" }))).rejects.toMatchObject({ code: "FONTS_MISSING" });
    await expect(runExportJob(REQUEST, {}, undefined, (async () => new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch)).rejects.toMatchObject({ code: "SERVER", message: "El servidor respondió 502" });
  });

  it("detalle de QR_IDENTITY_MISMATCH (objeto, no lista) apunta a su pieza", async () => {
    const f = (async () => Response.json({ code: "QR_IDENTITY_MISMATCH", message: "El hash no corresponde", requestId: "q", details: { recordId: "z" } }, { status: 400 })) as unknown as typeof fetch;
    await expect(runExportJob(REQUEST, {}, undefined, f)).rejects.toMatchObject({ code: "QR_IDENTITY_MISMATCH", recordId: "z" });
  });

  it("cancelar (AbortController) lanza ExportCancelledError, antes y durante el stream", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborting = (async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response(streamOf(complete()));
    }) as unknown as typeof fetch;
    await expect(runExportJob(REQUEST, {}, controller.signal, aborting)).rejects.toBeInstanceOf(ExportCancelledError);

    const live = new AbortController();
    const hanging = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encodeFrame.progress({ phase: "generating", done: 1, total: 9 }));
        live.signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    });
    const job = runExportJob(REQUEST, { onPhase: () => live.abort() }, live.signal, ok(hanging));
    await expect(job).rejects.toBeInstanceOf(ExportCancelledError);
  });
});
