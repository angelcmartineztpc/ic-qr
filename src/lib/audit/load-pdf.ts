import type * as PdfJs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

let ready: Promise<typeof PdfJs> | undefined;

/** Solo navegador. Worker de pdfjs y WASM de zxing salen del propio origen (la CSP no permite CDN). */
function setup(): Promise<typeof PdfJs> {
  ready ??= (async () => {
    const [pdfjs, { prepareZXingModule }] = await Promise.all([import("pdfjs-dist"), import("zxing-wasm/reader")]);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const wasm = new URL("zxing-wasm/reader/zxing_reader.wasm", import.meta.url).toString();
    prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasm : prefix + path) } });
    return pdfjs;
  })();
  return ready;
}

export class PdfOpenError extends Error {}

export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await setup();
  try {
    return await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 }).promise;
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new PdfOpenError(name === "PasswordException" ? "El PDF está protegido con contraseña." : "No se pudo abrir el archivo. Puede estar dañado o no ser un PDF.");
  }
}
