import encodeQR from "qr";

import type { QrMatrix } from "@/types";

/** Máximo de caracteres que admite la versión 40 con corrección H (bytes). */
export const MAX_PAYLOAD_LENGTH = 1273;

/**
 * Matriz de módulos del QR (true = oscuro), SIN zona de silencio.
 * Corrección de errores H, la única del MVP (§1.2-12). La librería exige un
 * borde ≥ 1, así que se pide 1 y se recorta el anillo.
 */
export function encodeMatrix(payload: string): QrMatrix {
  if (payload.length === 0) throw new RangeError("El contenido del QR está vacío");
  if (payload.length > MAX_PAYLOAD_LENGTH) throw new RangeError(`El contenido del QR supera ${MAX_PAYLOAD_LENGTH} caracteres`);
  const padded = encodeQR(payload, "raw", { ecc: "high", border: 1 });
  return padded.slice(1, -1).map((row) => row.slice(1, -1));
}

/** Versión QR (1–40) a partir del lado de la matriz. */
export const qrVersion = (modules: number): number => (modules - 17) / 4;
