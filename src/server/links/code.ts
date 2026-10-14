import { createHash } from "node:crypto";

import { SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH } from "@/schemas/links";

/**
 * Código de un link corto: determinista respecto al link y al número de intento.
 * Ocho caracteres de un alfabeto de 31 (≈ 40 bits). Se toman 8 bytes de la huella
 * como un entero y se reparte en base 31 (el sesgo del módulo es despreciable con 64 bits).
 */
export function shortCodeFor(url: string, attempt = 0): string {
  const digest = createHash("sha256").update(attempt === 0 ? url : `${url}\0${attempt}`).digest();
  let n = digest.readBigUInt64BE(0);
  const base = BigInt(SHORT_CODE_ALPHABET.length);
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += SHORT_CODE_ALPHABET[Number(n % base)];
    n /= base;
  }
  return out;
}
