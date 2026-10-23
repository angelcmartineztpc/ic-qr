import type { FontResolver } from "@/services/qr-produccion/document/fonts";
import type { PDFOptions, SheetLayout, TileScene } from "@/types";

export interface PdfSheetOptions {
  tile: { width: number; height: number };
  pdf: PDFOptions;
  /** Necesario solo en modo texto vivo (se incrustan las fuentes). */
  fonts?: FontResolver;
  title?: string;
  /** Fecha fija para PDFs reproducibles (tests). */
  creationDate?: Date;
  compress?: boolean;
}

/**
 * Puerto del escritor de PDF. La implementación con pdfkit vive en
 * supabase/functions/_shared/pdf-writer.ts (pdfkit no es dependencia de PULSE); aquí
 * solo se conoce la forma, para probar la orquestación de la exportación con un escritor falso.
 */
export interface PdfSheet {
  readonly grid: SheetLayout;
  add(scene: TileScene): void;
  /** Cierra el documento y devuelve todos sus bytes. */
  finish(): Promise<Uint8Array>;
}

export type PdfSheetFactory = (options: PdfSheetOptions) => PdfSheet;
