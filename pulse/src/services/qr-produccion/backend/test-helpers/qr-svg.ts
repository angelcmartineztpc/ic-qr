import { encodeMatrix } from "@/services/qr-produccion/qr/encode";
import { renderQrSvg } from "@/services/qr-produccion/qr/render-svg";
import type { QrMatrix } from "@/types";

const quiet = 4;

/** Estilo «qrcode» de npm: fondo blanco + trazos horizontales de 1 unidad. */
export function strokeQrSvg(matrix: QrMatrix): string {
  const size = matrix.length + 2 * quiet;
  const runs: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      runs.push(`M${x + quiet} ${y + quiet + 0.5}h${end - x}`);
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h${size}v${size}H0z"/><path stroke="#000000" d="${runs.join("")}"/></svg>`;
}

/** Estilo «un rect por módulo» con fondo blanco y fill heredado del grupo. */
export function rectQrSvg(matrix: QrMatrix): string {
  const size = matrix.length + 2 * quiet;
  const rects = matrix.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`] : []))).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="white"/><g fill="#000">${rects}</g></svg>`;
}

export const ownQrSvg = (payload: string): string => renderQrSvg(encodeMatrix(payload));
export const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Estilo «puntos / trazos gruesos con esquinas redondeadas» de generadores de marca: cada racha de módulos es un trazo
 * de `width` módulos con `linecap`/`linejoin` redondos (el trazo sobresale medio `width` por cada extremo y funde vecinos).
 */
export function thickRoundQrSvg(matrix: QrMatrix, { width = 1, cap = "round" as "round" | "butt" | "square" } = {}): string {
  const size = matrix.length + 2 * quiet;
  const runs: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      // Con caps redondos el trazo se alarga medio ancho: se acorta para que el dibujo cubra los mismos módulos.
      const inset = cap === "butt" ? 0 : width / 2;
      runs.push(`M${x + quiet + inset} ${y + quiet + 0.5}h${Math.max(end - x - 2 * inset, 0)}`);
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fff"/><path fill="none" stroke="#000" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round" d="${runs.join("")}"/></svg>`;
}
