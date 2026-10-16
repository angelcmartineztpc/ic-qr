import { round } from "@/lib/units";
import type { QrStyle } from "@/schemas/qr-style";
import type { HexColor, QrMatrix, SceneNode } from "@/types";

import { qrPlacement, recolorLogo, resolveStyleColors, styleQrPaths, type StyleColors } from "./style-qr";

const mm = (n: number): number => round(n, 0.001);
const paint = (rgb: HexColor) => ({ rgb });

export interface StyledQrInput {
  /** Caja cuadrada del QR en mm (incluye la zona de silencio). */
  box: { x: number; y: number; width: number };
  matrix: QrMatrix;
  quietZoneModules: number;
  style: QrStyle;
  /** Colores de la plantilla: lo que se usa cuando el estilo no define uno propio. */
  base: { dark: HexColor; light: HexColor };
  includeBackground: boolean;
}

export interface StyledQr {
  nodes: SceneNode[];
  colors: StyleColors;
  moduleMm: number;
}

/**
 * Los nodos del QR con estilo (fondo, módulos, marcos, pupilas y logo). Es la
 * ÚNICA implementación: la usan la escena de la pieza (vista previa, PDF y SVG)
 * y la vista previa en vivo del paso «Estilo del QR», así que lo que se ve es
 * exactamente lo que se fabrica.
 */
export function styledQrNodes({ box, matrix, quietZoneModules, style, base, includeBackground }: StyledQrInput): StyledQr {
  const modules = matrix.length;
  const colors = resolveStyleColors(style, base);
  const { moduleMm, originX, originY } = qrPlacement(box, modules, quietZoneModules, style.outline);
  const nodes: SceneNode[] = [];
  if (includeBackground) {
    nodes.push({
      type: "rect",
      layer: "qr",
      id: "qr-background",
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.width,
      ...(style.outline === "circle" ? { r: box.width / 2 } : {}),
      fill: paint(colors.background),
    });
  }
  const out = styleQrPaths(matrix, style, { x: originX, y: originY, module: moduleMm, decimals: 3 });
  nodes.push({ type: "path", layer: "qr", id: "qr-code", d: out.modules, fill: paint(colors.modules), fillRule: "nonzero", title: "QR" });
  nodes.push({ type: "path", layer: "qr", id: "qr-eye-frame", d: out.eyeFrame, fill: paint(colors.eyeFrame), fillRule: "nonzero" });
  nodes.push({ type: "path", layer: "qr", id: "qr-eye-ball", d: out.eyeBall, fill: paint(colors.eyeBall), fillRule: "nonzero" });
  if (style.logo && out.logo) {
    const [vx, vy, vw, vh] = style.logo.geometry.viewBox;
    const side = out.logo.side * moduleMm;
    const scale = side / Math.max(vw, vh);
    const cx = originX + out.logo.cx * moduleMm;
    const cy = originY + out.logo.cy * moduleMm;
    nodes.push({
      type: "qrExternal",
      layer: "qr",
      id: "qr-logo",
      box: { x: mm(cx - (vw * scale) / 2), y: mm(cy - (vh * scale) / 2), width: mm(side), height: mm(side) },
      geometry: { kind: "external", viewBox: [vx, vy, vw, vh], nodes: recolorLogo(style.logo.geometry.nodes, style.logo.color), strokeBased: false },
    });
  }
  return { nodes, colors, moduleMm };
}
