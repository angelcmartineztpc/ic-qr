import { describe, expect, it } from "vitest";

import { encodeFrame, FRAME, FrameDecodeError, readFrames, type Frame } from "./frames";

const stream = (parts: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
const collect = async (s: ReadableStream<Uint8Array>) => {
  const out: Frame[] = [];
  for await (const frame of readFrames(s)) out.push(frame);
  return out;
};
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe("protocolo de frames", () => {
  const all = [
    encodeFrame.progress({ phase: "generating", done: 3, total: 10 }),
    encodeFrame.fileMeta({ fileId: "pdf", name: "Mesas – 2026.pdf", size: 5, mime: "application/pdf" }),
    encodeFrame.fileChunk("pdf", Uint8Array.from([1, 2, 3, 4, 5])),
    encodeFrame.fileChunk("zip", Uint8Array.from([9])),
    encodeFrame.warning({ recordId: "r1", code: "QR_MODULE_SMALL", message: "Módulos pequeños" }),
    encodeFrame.done({ pages: 1, pieces: 10, warnings: 1 }),
    encodeFrame.error({ code: "INTERNAL", message: "x", requestId: "q" }),
  ];

  it("tiene el formato [tipo:u8][longitud:u32 BE][payload]", () => {
    const frame = encodeFrame.done({ pages: 1, pieces: 2, warnings: 0 });
    expect(frame[0]).toBe(FRAME.DONE);
    expect(new DataView(frame.buffer).getUint32(1, false)).toBe(frame.length - 5);
    expect(JSON.parse(new TextDecoder().decode(frame.subarray(5)))).toEqual({ pages: 1, pieces: 2, warnings: 0 });
  });

  it("ida y vuelta, también con nombres con –, acentos y emoji", async () => {
    const frames = await collect(stream(all));
    expect(frames.map((f) => f.type)).toEqual([1, 2, 3, 3, 5, 4, 6]);
    expect(frames[1]).toMatchObject({ payload: { name: "Mesas – 2026.pdf" } });
    expect(frames[2]).toMatchObject({ fileId: "pdf", data: Uint8Array.from([1, 2, 3, 4, 5]) });
    expect(frames[3]).toMatchObject({ fileId: "zip" });
  });

  it("une frames partidos en cualquier punto (byte a byte)", async () => {
    const bytes = concat(all);
    const parts = Array.from(bytes, (b) => Uint8Array.of(b));
    expect((await collect(stream(parts))).map((f) => f.type)).toEqual([1, 2, 3, 3, 5, 4, 6]);
  });

  it("un stream cortado a mitad de un frame es un error explícito (STREAM_TRUNCATED en el cliente)", async () => {
    const bytes = concat(all);
    await expect(collect(stream([bytes.subarray(0, bytes.length - 3)]))).rejects.toBeInstanceOf(FrameDecodeError);
    await expect(collect(stream([Uint8Array.of(1, 0)]))).rejects.toThrow(/mitad de un frame/);
  });

  it("rechaza tipos y archivos desconocidos", async () => {
    await expect(collect(stream([Uint8Array.of(99, 0, 0, 0, 0)]))).rejects.toThrow(/desconocido/);
    await expect(collect(stream([Uint8Array.of(3, 0, 0, 0, 1, 77)]))).rejects.toThrow(/fileId/);
  });
});
