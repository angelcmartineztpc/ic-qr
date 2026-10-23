import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { readBarcodes, type ReaderOptions } from "zxing-wasm/reader";

import type { PageRead } from "./models";

const ZOOM = 3; // 216 dpi: suficiente para QR impresos
const RETRY_ZOOM = 5; // segundo intento para QR difíciles
const MAX_SIDE_PX = 6000; // piezas de gran formato
const QUIET_ZONE_PX = 120;

const READER_OPTIONS: ReaderOptions = { formats: ["QRCode"], tryHarder: true, tryInvert: true, tryRotate: true, tryDownscale: true, maxNumberOfSymbols: 32, returnErrors: true };

/** Raster RGBA con la forma que acepta zxing-wasm (ImageData no existe en Node). */
export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

async function renderPage(pdf: PDFDocumentProxy, page: PDFPageProxy, zoom: number): Promise<Raster> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(zoom, MAX_SIDE_PX / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const { canvas, context } = (pdf.canvasFactory as { create(w: number, h: number): { canvas: unknown; context: CanvasRenderingContext2D } }).create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  context.fillStyle = "#fff"; // los PDF con fondo transparente se leerían sobre negro
  context.fillRect(0, 0, Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas: canvas as HTMLCanvasElement, canvasContext: context, viewport }).promise;
  const image = context.getImageData(0, 0, Math.ceil(viewport.width), Math.ceil(viewport.height));
  (pdf.canvasFactory as { destroy(c: unknown): void }).destroy({ canvas, context });
  return image;
}

/** Añade zona silenciosa blanca: ayuda cuando el diseño deja el QR pegado al borde. */
function withQuietZone(src: Raster): Raster {
  const width = src.width + 2 * QUIET_ZONE_PX;
  const height = src.height + 2 * QUIET_ZONE_PX;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < src.height; y++) {
    data.set(src.data.subarray(y * src.width * 4, (y + 1) * src.width * 4), ((y + QUIET_ZONE_PX) * width + QUIET_ZONE_PX) * 4);
  }
  return { data, width, height };
}

/** (contenidos decodificados, QR detectados sin decodificar) con la imagen tal cual y con zona silenciosa. */
async function decode(raster: Raster): Promise<{ found: string[]; undecoded: number }> {
  const found = new Set<string>();
  let undecoded = 0;
  for (const image of [raster, withQuietZone(raster)]) {
    const results = await readBarcodes(image as unknown as ImageData, READER_OPTIONS);
    for (const r of results) if (r.isValid && r.text) found.add(r.text);
    undecoded = Math.max(undecoded, results.filter((r) => !r.isValid).length);
    if (found.size > 0 && undecoded === 0) break;
  }
  return { found: [...found], undecoded: found.size > 0 ? Math.max(0, undecoded - found.size) : undecoded };
}

async function pieceName(page: PDFPageProxy, label: string | undefined, index: number): Promise<string> {
  if (label) return label;
  const { items } = await page.getTextContent();
  for (const item of items) {
    const line = "str" in item ? item.str.trim() : "";
    if (line.length >= 3) return line.slice(0, 60);
  }
  return `Página ${index + 1}`;
}

/** Lee los QR de la página `index` (0-based); reintenta a mayor resolución si no hay nada. */
export async function readPage(pdf: PDFDocumentProxy, index: number, labels: readonly string[] | null, makeThumb?: (raster: Raster) => string): Promise<PageRead> {
  const page = await pdf.getPage(index + 1);
  try {
    const raster = await renderPage(pdf, page, ZOOM);
    let result = await decode(raster);
    if (result.found.length === 0) result = await decode(await renderPage(pdf, page, RETRY_ZOOM));
    return { page: index + 1, piece: await pieceName(page, labels?.[index], index), payloads: result.found, undecoded: result.undecoded, ...(makeThumb ? { thumb: makeThumb(raster) } : {}) };
  } finally {
    page.cleanup();
  }
}

export interface ReadPdfOptions {
  signal?: AbortSignal;
  /** Se llama tras cada página, en orden. */
  onPage: (read: PageRead, done: number, total: number) => void | Promise<void>;
}

export async function readPdfQrs(pdf: PDFDocumentProxy, { signal, onPage }: ReadPdfOptions): Promise<void> {
  const total = pdf.numPages;
  const labels = await pdf.getPageLabels();
  for (let i = 0; i < total; i++) {
    signal?.throwIfAborted();
    await onPage(await readPage(pdf, i, labels), i + 1, total);
  }
}
