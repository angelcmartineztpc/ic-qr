import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareZXingModule } from "zxing-wasm/reader";

import type { PageRead } from "./models";
import { readPdfQrs } from "./read-pdf-qr";

const fixture = (name: string) => readFile(fileURLToPath(new URL(`../../../tests/fixtures/audit/${name}`, import.meta.url)));

async function readAll(name: string): Promise<PageRead[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await fixture(name)), verbosity: 0 }).promise;
  const reads: PageRead[] = [];
  await readPdfQrs(pdf as never, { onPage: (r) => void reads.push(r) });
  return reads;
}

describe("readPdfQrs", () => {
  beforeAll(async () => {
    const wasmBinary = await readFile(fileURLToPath(new URL("../../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url)));
    await prepareZXingModule({ overrides: { wasmBinary: wasmBinary.buffer as ArrayBuffer }, fireImmediately: true });
  });

  // Mismos resultados que el auditor Python original: un único QR por página, siempre la misma URL.
  it.each([
    ["central.pdf", 107, "HTTPS://PULSE.THEPALACECOMPANY.COM/S/WVU7AFD3"],
    ["lobby-bar.pdf", 84, "HTTPS://PULSE.THEPALACECOMPANY.COM/S/U37XRYAP"],
  ])("lee todos los QR de %s", async (name, pages, url) => {
    const reads = await readAll(name);
    expect(reads).toHaveLength(pages);
    for (const r of reads) expect(r).toMatchObject({ payloads: [url], undecoded: 0 });
  }, 120_000);
});
