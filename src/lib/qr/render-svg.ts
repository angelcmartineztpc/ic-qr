import { QR_ASSET_MARGIN_MODULES } from "./version";
import { matrixToPath } from "./matrix-to-path";
import type { QrMatrix } from "@/types";

/**
 * SVG canónico del QR (el asset que se sube al storage). Coordenadas ENTERAS
 * en módulos: la salida es determinista byte a byte entre Node, Bun y navegador.
 * Fondo blanco, módulos negros y zona de silencio de 4 módulos (ISO).
 */
export function renderQrSvg(matrix: QrMatrix): string {
  const size = matrix.length + 2 * QR_ASSET_MARGIN_MODULES;
  const d = matrixToPath(matrix, { x: QR_ASSET_MARGIN_MODULES, y: QR_ASSET_MARGIN_MODULES, module: 1, decimals: 0 });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#FFFFFF"/>` +
    `<path fill="#000000" fill-rule="evenodd" d="${d}"/>` +
    `</svg>`
  );
}
