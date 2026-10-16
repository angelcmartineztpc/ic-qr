/** Descarga un archivo generado en el navegador (proyecto, SVG, ZIP…) y libera la URL temporal. */
export function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Tras el clic el navegador ya tiene la referencia; se libera en el siguiente ciclo.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
