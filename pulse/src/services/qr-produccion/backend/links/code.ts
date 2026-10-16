import { SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH } from "@/services/qr-produccion/schemas/links";

import { sha256Bytes } from "../util/sha256";

/**
 * Código de un link corto: determinista respecto al link y al número de intento.
 * Ocho caracteres de un alfabeto de 31 (≈ 40 bits). Se toman 8 bytes de la huella
 * como un entero y se reparte en base 31 (el sesgo del módulo es despreciable con 64 bits).
 */
export function shortCodeFor(url: string, attempt = 0): string {
  const digest = sha256Bytes(new TextEncoder().encode(attempt === 0 ? url : `${url}\0${attempt}`));
  let n = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, false);
  const base = BigInt(SHORT_CODE_ALPHABET.length);
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += SHORT_CODE_ALPHABET[Number(n % base)];
    n /= base;
  }
  return out;
}
