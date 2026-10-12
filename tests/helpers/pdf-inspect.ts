/**
 * Inspección de un PDF generado, para las aserciones de "es vectorial":
 * recorre TODOS los objetos con pdf-lib (sin renderizar nada) y los operadores
 * de cada página con pdfjs. Pensado para PDFs con compress:false o comprimidos.
 */
import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFDocument, PDFRef } from "pdf-lib";

export interface PdfReport {
  pageCount: number;
  mediaBoxes: Array<[number, number, number, number]>;
  /** Objetos con /Subtype /Image (debe ser 0). */
  imageObjects: number;
  /** Diccionarios /XObject de página con alguna imagen. */
  fontFiles: number;
  fontNames: string[];
  fontsWithToUnicode: number;
  fontsTotal: number;
  separations: string[];
  usesDeviceCmyk: boolean;
  trimBoxes: Array<number[] | null>;
}

const num = (value: unknown): number => (value instanceof PDFNumber ? value.asNumber() : Number.NaN);

export async function inspectPdf(bytes: Uint8Array): Promise<PdfReport> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const report: PdfReport = {
    pageCount: doc.getPageCount(),
    mediaBoxes: [],
    imageObjects: 0,
    fontFiles: 0,
    fontNames: [],
    fontsWithToUnicode: 0,
    fontsTotal: 0,
    separations: [],
    usesDeviceCmyk: false,
    trimBoxes: [],
  };

  for (const page of doc.getPages()) {
    const box = page.node.MediaBox();
    report.mediaBoxes.push([0, 1, 2, 3].map((i) => num(box?.get(i))) as [number, number, number, number]);
    const trim = page.node.lookupMaybe(PDFName.of("TrimBox"), PDFArray);
    report.trimBoxes.push(trim ? [0, 1, 2, 3].map((i) => num(trim.get(i))) : null);
  }

  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFRawStream ? object.dict : object instanceof PDFDict ? object : null;
    if (dict) {
      if (dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) report.imageObjects++;
      if (dict.get(PDFName.of("FontFile2")) || dict.get(PDFName.of("FontFile3")) || dict.get(PDFName.of("FontFile"))) report.fontFiles++;
      if (dict.get(PDFName.of("Type")) === PDFName.of("Font") && dict.get(PDFName.of("Subtype")) === PDFName.of("Type0")) {
        report.fontsTotal++;
        report.fontNames.push(String(dict.get(PDFName.of("BaseFont"))));
        if (dict.get(PDFName.of("ToUnicode"))) report.fontsWithToUnicode++;
      }
      if (dict.get(PDFName.of("Type")) === PDFName.of("Font") && dict.get(PDFName.of("Subtype")) === PDFName.of("Type1")) {
        report.fontsTotal++;
        report.fontNames.push(String(dict.get(PDFName.of("BaseFont"))));
      }
    }
    if (object instanceof PDFArray && object.size() >= 3 && object.get(0) === PDFName.of("Separation")) {
      report.separations.push(String(object.get(1)).replace(/^\//, ""));
    }
    if (object instanceof PDFArray && object.get(0) === PDFName.of("Separation") && object.get(2) === PDFName.of("DeviceCMYK")) report.usesDeviceCmyk = true;
  }
  return report;
}

/** Contenido decodificado de todas las páginas (operadores del PDF) para buscar `cm`, `BT`, `Do`… */
export async function pageContents(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const { decodePDFRawStream } = await import("pdf-lib");
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return refs
      .map((ref) => {
        const stream = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
        return stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1") : "";
      })
      .join("\n");
  });
}

/** Texto extraíble (con pdfjs): prueba que las fuentes llevan ToUnicode y que el texto sigue siendo texto. */
export async function extractText(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await task.destroy();
  return pages;
}

/** Operadores gráficos de una página con pdfjs (para contar imágenes pintadas). */
export async function paintedImageOps(bytes: Uint8Array): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const pdf = await task.promise;
  const imageOps = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].filter((v): v is number => typeof v === "number"));
  let total = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const list = await (await pdf.getPage(i)).getOperatorList();
    total += list.fnArray.filter((fn) => imageOps.has(fn)).length;
  }
  await task.destroy();
  return total;
}
