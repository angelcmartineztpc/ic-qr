// @types/pdfkit (0.17) va por detrás de pdfkit 0.20: añadimos lo que usamos.
declare namespace PDFKit {
  interface PDFDocument {
    /** Tinta plana (Separation) con su alternativa CMYK en porcentaje 0–100. */
    addSpotColor(name: string, c: number, m: number, y: number, k: number): this;
  }
}
