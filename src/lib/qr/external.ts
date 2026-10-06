import { round } from "@/lib/units";
import type { Matrix2D } from "@/types";

import type { ExternalGeometry } from "@/schemas/qr-geometry";

const num = (n: number) => String(round(n, 0.0001) || 0);
const matrix = (m: Matrix2D | undefined) => (m ? ` transform="matrix(${m.map(num).join(" ")})"` : "");

/**
 * SVG propio de una geometría saneada: es lo ÚNICO que se rasteriza para
 * verificar un QR externo (nunca el archivo original). Fondo blanco y una
 * zona de silencio generosa para que el decodificador lea aunque el SVG
 * original no traiga márgenes.
 */
export function externalGeometryToSvg(geometry: ExternalGeometry, options: { sizePx: number; paddingRatio?: number }): string {
  const [vx, vy, vw, vh] = geometry.viewBox;
  const side = Math.max(vw, vh);
  const pad = side * (options.paddingRatio ?? 0.12);
  const box = side + 2 * pad;
  const inner = geometry.nodes
    .map((node) => {
      if (node.type === "rect") return `<rect x="${num(node.x)}" y="${num(node.y)}" width="${num(node.w)}" height="${num(node.h)}" fill="${node.fill}"${matrix(node.transform)}/>`;
      if (node.fill === "none" && !node.stroke) return "";
      const stroke = node.stroke ? ` stroke="${node.stroke}" stroke-width="${num(node.strokeWidth ?? 1)}"` : "";
      return `<path d="${node.d}" fill="${node.fill}" fill-rule="${node.fillRule}"${stroke}${matrix(node.transform)}/>`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.sizePx}" height="${options.sizePx}" viewBox="0 0 ${num(box)} ${num(box)}">` +
    `<rect width="${num(box)}" height="${num(box)}" fill="#FFFFFF"/>` +
    `<g transform="translate(${num(pad - vx)} ${num(pad - vy)})">${inner}</g></svg>`
  );
}
