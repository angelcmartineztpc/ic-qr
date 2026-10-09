import "server-only";

import PDFDocument from "pdfkit";

import type { FontResolver } from "@/lib/document/fonts";
import { packGrid } from "@/lib/document/sheet";
import { MM_TO_PT, PT_TO_MM, pageSizePt } from "@/lib/units";
import type { Paint, PDFOptions, SceneNode, SheetLayout, TileScene } from "@/types";

type Cmyk = [number, number, number, number];

export interface PdfWriterOptions {
  /** Tamaño de la pieza en mm (de la plantilla). */
  tile: { width: number; height: number };
  pdf: PDFOptions;
  /** Necesario solo en modo texto vivo (se incrustan las fuentes). */
  fonts?: FontResolver;
  title?: string;
  /** Fecha fija para PDFs reproducibles (tests). */
  creationDate?: Date;
  /** false = flujos sin comprimir, legibles para inspección (tests). */
  compress?: boolean;
}

/** RGB → CMYK simple (solo si la plantilla no declara un CMYK propio). */
export function rgbToCmyk(hex: string): Cmyk {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  const c = (v: number) => Math.round(((1 - v - k) / (1 - k)) * 1000) / 10;
  return [c(r), c(g), c(b), Math.round(k * 1000) / 10];
}

/**
 * Escritor de PDF vectorial. Dibuja la MISMA escena que el SVG con las
 * primitivas de pdfkit (path, rect, text): nunca hay imágenes ni canvas ni
 * un parser de SVG. La página se declara en puntos calculados desde mm
 * (nunca el nombre 'A4' de pdfkit, que son 210.0016 × 297.0001 mm).
 *
 * Cada pieza se dibuja en `translate(posición en pt) · scale(MM_TO_PT)`:
 * toda la geometría de la escena queda en mm.
 */
export class PdfSheetWriter {
  readonly doc: PDFKit.PDFDocument;
  readonly grid: SheetLayout;
  private index = 0;
  private readonly spot = new Set<string>();
  private readonly registeredFonts = new Map<string, string>();

  constructor(private readonly options: PdfWriterOptions) {
    this.grid = packGrid({ tile: options.tile, options: options.pdf });
    this.doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
      // Sin fuente por defecto: pdfkit cargaría Helvetica (un módulo que no existe en Cloudflare Workers)
      // y nunca la usamos: el texto va con la fuente de la plantilla o en contornos.
      font: null as unknown as string,
      compress: options.compress ?? true,
      pdfVersion: "1.7",
      info: {
        Title: options.title ?? "QR Production",
        Producer: "QR Production Generator",
        Creator: "QR Production Generator",
        ...(options.creationDate ? { CreationDate: options.creationDate } : {}),
      },
    });
  }

  /** Añade una pieza en el siguiente hueco (y una página nueva cuando hace falta). */
  add(scene: TileScene): void {
    const { perPage, originMm, pitchMm, cols, pageMm } = this.grid;
    const slot = this.index % perPage;
    if (slot === 0) this.addPage(pageMm.width, pageMm.height);
    const x = originMm.x + (slot % cols) * pitchMm.x;
    const y = originMm.y + Math.floor(slot / cols) * pitchMm.y;
    this.drawScene(scene, x, y);
    this.index++;
  }

  get pieceCount(): number {
    return this.index;
  }

  /** Cierra el documento. El PDF se emite por el stream de `doc`. */
  end(): void {
    this.doc.end();
  }

  private addPage(widthMm: number, heightMm: number): void {
    const [w, h] = pageSizePt(widthMm, heightMm);
    this.doc.addPage({ size: [w, h], margin: 0 });
    const bleed = this.options.pdf.bleedMm;
    if (this.options.pdf.mode === "single" && bleed > 0) {
      const page = this.doc.page as unknown as { dictionary: { data: Record<string, unknown> } };
      const b = bleed * MM_TO_PT;
      page.dictionary.data.TrimBox = [b, b, w - b, h - b];
      page.dictionary.data.BleedBox = [0, 0, w, h];
    }
  }

  private color(paint: Paint): string | Cmyk {
    const pdf = paint.pdf;
    if (pdf && "spot" in pdf) {
      if (!this.spot.has(pdf.spot)) {
        this.doc.addSpotColor(pdf.spot, ...pdf.cmyk);
        this.spot.add(pdf.spot);
      }
      return pdf.spot;
    }
    if (this.options.pdf.colorSpace === "cmyk") return pdf ? pdf.cmyk : rgbToCmyk(paint.rgb);
    return paint.rgb;
  }

  private fontKey(ref: Extract<SceneNode, { type: "text" }>["font"]): string {
    const resolver = this.options.fonts;
    if (!resolver) throw new Error("El modo de texto vivo necesita las fuentes (opción `fonts`)");
    const loaded = resolver(ref);
    if (!loaded.filePath && !loaded.bytes) throw new Error("La fuente no tiene archivo ni bytes para incrustar");
    const key = `${ref.family}-${ref.weight}-${ref.style}`;
    if (!this.registeredFonts.has(key)) {
      this.doc.registerFont(key, loaded.bytes ? Buffer.from(loaded.bytes) : (loaded.filePath as string));
      this.registeredFonts.set(key, loaded.filePath ?? key);
    }
    return key;
  }

  private drawScene(scene: TileScene, xMm: number, yMm: number): void {
    const doc = this.doc;
    doc.save();
    doc.translate(xMm * MM_TO_PT, yMm * MM_TO_PT);
    doc.scale(MM_TO_PT);
    for (const node of scene.nodes) this.drawNode(node);
    doc.restore();
  }

  private drawNode(node: SceneNode): void {
    const doc = this.doc;
    switch (node.type) {
      case "rect": {
        if (node.r) doc.roundedRect(node.x, node.y, node.w, node.h, node.r);
        else doc.rect(node.x, node.y, node.w, node.h);
        if (node.fill && node.stroke) {
          doc.lineWidth(node.stroke.widthMm).fillColor(this.color(node.fill)).strokeColor(this.color(node.stroke.paint)).fillAndStroke();
        } else if (node.fill) {
          doc.fillColor(this.color(node.fill)).fill();
        } else if (node.stroke) {
          doc.lineWidth(node.stroke.widthMm).strokeColor(this.color(node.stroke.paint)).stroke();
        }
        return;
      }
      case "path": {
        doc.path(node.d).fill(this.color(node.fill), node.fillRule === "evenodd" ? "even-odd" : "non-zero");
        return;
      }
      case "text": {
        const key = this.fontKey(node.font);
        const sizeMm = node.sizePt * PT_TO_MM;
        doc.font(key).fontSize(sizeMm).fillColor(this.color(node.fill));
        const ascender = (doc as unknown as { _font: { ascender: number } })._font.ascender / 1000;
        doc.text(node.text, node.xMm, node.baselineMm - ascender * sizeMm, {
          lineBreak: false,
          characterSpacing: node.trackingPt * PT_TO_MM,
        });
        return;
      }
      case "qrExternal": {
        const { box, geometry } = node;
        const [vx, vy, vw, vh] = geometry.viewBox;
        const scale = box.width / Math.max(vw, vh);
        doc.save();
        doc.translate(box.x, box.y).scale(scale).translate(-vx, -vy);
        for (const child of geometry.nodes) {
          doc.save();
          if (child.transform) doc.transform(...child.transform);
          if (child.type === "rect") {
            doc.rect(child.x, child.y, child.w, child.h).fill(child.fill);
          } else if (child.fill !== "none") {
            doc.path(child.d).fill(child.fill, child.fillRule === "evenodd" ? "even-odd" : "non-zero");
          }
          doc.restore();
        }
        doc.restore();
        return;
      }
    }
  }
}

/** Todo el PDF en memoria (tests y SVG→PDF de una pieza). La exportación real lo emite en streaming. */
export async function renderPdfToBuffer(scenes: Iterable<TileScene>, options: PdfWriterOptions): Promise<Buffer> {
  const writer = new PdfSheetWriter(options);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    writer.doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    writer.doc.on("end", () => resolve(Buffer.concat(chunks)));
    writer.doc.on("error", reject);
  });
  for (const scene of scenes) writer.add(scene);
  writer.end();
  return done;
}
