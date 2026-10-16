/**
 * Escritor de PDF vectorial con pdfkit (`npm:pdfkit`). Dibuja la MISMA escena que el SVG con las primitivas de
 * pdfkit (path, rect, text): nunca hay imágenes ni canvas ni un parser de SVG. La página se declara en puntos
 * calculados desde mm (nunca el nombre 'A4' de pdfkit, que son 210.0016 × 297.0001 mm).
 *
 * Cada pieza se dibuja en `translate(posición en pt) · scale(MM_TO_PT)`: toda la geometría de la escena queda en mm.
 */
import { Buffer } from "node:buffer";

import PDFDocument from "pdfkit";

import { packGrid } from "@/services/qr-produccion/document/sheet.ts";
import type { PdfSheet, PdfSheetOptions } from "@/services/qr-produccion/backend/export/pdf-port.ts";
import { MM_TO_PT, PT_TO_MM, pageSizePt } from "@/services/qr-produccion/units/index.ts";
import type { Paint, SceneNode, SheetLayout, TileScene } from "@/types";

type Cmyk = [number, number, number, number];

// `addSpotColor` existe en pdfkit 0.20 pero @types/pdfkit va por detrás: se declara lo que se usa.
interface Doc {
  page: unknown;
  addPage(options: { size: [number, number]; margin: number }): Doc;
  addSpotColor(name: string, c: number, m: number, y: number, k: number): Doc;
  registerFont(name: string, source: Buffer | string): Doc;
  save(): Doc;
  restore(): Doc;
  translate(x: number, y: number): Doc;
  scale(factor: number): Doc;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): Doc;
  rect(x: number, y: number, w: number, h: number): Doc;
  roundedRect(x: number, y: number, w: number, h: number, r: number): Doc;
  path(d: string): Doc;
  lineWidth(width: number): Doc;
  fillColor(color: string | Cmyk): Doc;
  strokeColor(color: string | Cmyk): Doc;
  fill(color?: string | Cmyk, rule?: "even-odd" | "non-zero"): Doc;
  stroke(): Doc;
  fillAndStroke(): Doc;
  font(name: string): Doc;
  fontSize(size: number): Doc;
  text(text: string, x: number, y: number, options: { lineBreak: boolean; characterSpacing: number }): Doc;
  on(event: "data" | "end" | "error", listener: (arg: never) => void): Doc;
  end(): void;
  _font: { ascender: number };
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

class PdfSheetWriter implements PdfSheet {
  readonly grid: SheetLayout;
  private readonly doc: Doc;
  private readonly chunks: Uint8Array[] = [];
  private readonly done: Promise<Uint8Array>;
  private index = 0;
  private readonly spot = new Set<string>();
  private readonly registeredFonts = new Set<string>();

  constructor(private readonly options: PdfSheetOptions) {
    this.grid = packGrid({ tile: options.tile, options: options.pdf });
    this.doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
      // Sin fuente por defecto: pdfkit cargaría Helvetica (lee su .afm del disco, que no existe en Edge Functions)
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
    }) as unknown as Doc;
    this.done = new Promise<Uint8Array>((resolve, reject) => {
      this.doc.on("data", ((chunk: Uint8Array) => this.chunks.push(chunk)) as never);
      this.doc.on("end", (() => {
        const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0;
        for (const chunk of this.chunks) {
          out.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(out);
      }) as never);
      this.doc.on("error", reject as never);
    });
  }

  add(scene: TileScene): void {
    const { perPage, originMm, pitchMm, cols, pageMm } = this.grid;
    const slot = this.index % perPage;
    if (slot === 0) this.addPage(pageMm.width, pageMm.height);
    this.drawScene(scene, originMm.x + (slot % cols) * pitchMm.x, originMm.y + Math.floor(slot / cols) * pitchMm.y);
    this.index++;
  }

  finish(): Promise<Uint8Array> {
    this.doc.end();
    return this.done;
  }

  private addPage(widthMm: number, heightMm: number): void {
    const [w, h] = pageSizePt(widthMm, heightMm);
    this.doc.addPage({ size: [w, h], margin: 0 });
    const bleed = this.options.pdf.bleedMm;
    if (this.options.pdf.mode === "single" && bleed > 0) {
      const page = this.doc.page as { dictionary: { data: Record<string, unknown> } };
      const b = bleed * MM_TO_PT;
      page.dictionary.data["TrimBox"] = [b, b, w - b, h - b];
      page.dictionary.data["BleedBox"] = [0, 0, w, h];
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
    if (!loaded.bytes) throw new Error("La fuente no tiene bytes para incrustar");
    const key = `${ref.family}-${ref.weight}-${ref.style}`;
    if (!this.registeredFonts.has(key)) {
      this.doc.registerFont(key, Buffer.from(loaded.bytes));
      this.registeredFonts.add(key);
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
        if (node.fill && node.stroke) doc.lineWidth(node.stroke.widthMm).fillColor(this.color(node.fill)).strokeColor(this.color(node.stroke.paint)).fillAndStroke();
        else if (node.fill) doc.fillColor(this.color(node.fill)).fill();
        else if (node.stroke) doc.lineWidth(node.stroke.widthMm).strokeColor(this.color(node.stroke.paint)).stroke();
        return;
      }
      case "path":
        doc.path(node.d).fill(this.color(node.fill), node.fillRule === "evenodd" ? "even-odd" : "non-zero");
        return;
      case "text": {
        const key = this.fontKey(node.font);
        const sizeMm = node.sizePt * PT_TO_MM;
        doc.font(key).fontSize(sizeMm).fillColor(this.color(node.fill));
        const ascender = doc._font.ascender / 1000;
        doc.text(node.text, node.xMm, node.baselineMm - ascender * sizeMm, { lineBreak: false, characterSpacing: node.trackingPt * PT_TO_MM });
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
          if (child.type === "rect") doc.rect(child.x, child.y, child.w, child.h).fill(child.fill);
          else if (child.fill !== "none") doc.path(child.d).fill(child.fill, child.fillRule === "evenodd" ? "even-odd" : "non-zero");
          doc.restore();
        }
        doc.restore();
        return;
      }
    }
  }
}

export const createPdfSheet = (options: PdfSheetOptions): PdfSheet => new PdfSheetWriter(options);
