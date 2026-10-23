import { decodeQR } from "qr/decode.js";

import type { ExternalGeometry } from "@/services/qr-produccion/schemas/qr-geometry";

import { rasterizeGeometry } from "./rasterize";

const SIZE_PX = 1024;
const MAX_PAYLOAD = 4096;

/**
 * Rasteriza NUESTRA geometría saneada (nunca el SVG original) y la decodifica.
 * `undefined` = no hay un QR legible (o el trazado no se pudo dibujar).
 */
export function decodeExternalGeometry(geometry: ExternalGeometry): string | undefined {
  try {
    const { width, height, data } = rasterizeGeometry(geometry, { sizePx: SIZE_PX });
    const text = decodeQR({ width, height, data });
    return text.length > MAX_PAYLOAD ? text.slice(0, MAX_PAYLOAD) : text;
  } catch {
    return undefined;
  }
}
