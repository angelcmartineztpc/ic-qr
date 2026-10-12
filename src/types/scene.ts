import type { Box, LayoutWarning } from "./layout";
import type { HexColor, Mm, Pt, RecordId } from "./common";
import type { QrGeometry } from "./qr";
import type { FontRef, PdfPaint } from "./template";

/** Representación intermedia única de una pieza (§A.7): alimenta preview, SVG y PDF. */
export interface Paint {
  rgb: HexColor;
  pdf?: PdfPaint;
}

export type SceneLayer = "background" | "artwork" | "text" | "qr" | "cutline";

export type SceneNode =
  | { type: "rect"; layer: SceneLayer; id: string; x: Mm; y: Mm; w: Mm; h: Mm; r?: Mm; fill?: Paint; stroke?: { paint: Paint; widthMm: Mm } }
  | { type: "path"; layer: SceneLayer; id: string; d: string; fill: Paint; fillRule: "nonzero" | "evenodd"; title?: string }
  | {
      type: "text";
      layer: "text";
      id: string;
      text: string;
      font: FontRef;
      sizePt: Pt;
      trackingPt: Pt;
      xMm: Mm;
      baselineMm: Mm;
      widthMm: Mm;
      fill: Paint;
    }
  | { type: "qrExternal"; layer: "qr"; id: string; box: Box; geometry: Extract<QrGeometry, { kind: "external" }> };

export interface TileScene {
  widthMm: Mm;
  heightMm: Mm;
  nodes: SceneNode[];
  warnings: LayoutWarning[];
  meta: { recordId: RecordId; templateId: string; templateVersion: string };
}
