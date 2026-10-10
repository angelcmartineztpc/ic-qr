const ZWJ = "‍";

/**
 * Normalización única de texto (formulario, Excel, archivo de proyecto):
 * NFC, caracteres de control → espacio, caracteres de formato (bidi,
 * zero-width, BOM) eliminados salvo ZWJ (emojis compuestos), espacios colapsados.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\p{Cf}/gu, (char) => (char === ZWJ ? char : ""))
    .replace(/\s+/gu, " ")
    .trim();
}

/** Clave de comparación: normalizada y sin distinguir mayúsculas (es). */
export function comparableText(value: string): string {
  return normalizeText(value).toLocaleLowerCase("es");
}
