/**
 * Une los PDF de los lotes en UNO, en el navegador (pdf-lib, JS puro). Cada lote ya es vectorial: aquí solo se copian
 * las páginas tal cual (contenido, MediaBox/TrimBox/BleedBox), sin rasterizar ni reescribir el dibujo. pdf-lib se carga
 * al unir, no al abrir la app.
 */
export async function mergePdfs(parts: readonly Uint8Array[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create({ updateMetadata: false });
  for (const part of parts) {
    const source = await PDFDocument.load(part, { updateMetadata: false });
    for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
  }
  return merged.save({ useObjectStreams: false });
}
