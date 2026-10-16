/**
 * Juego de caracteres admitido en las piezas. Gobierna la validación previa
 * (el navegador no tiene la fuente) y se contrasta con las fuentes reales en
 * un test: si la tipografía de las piezas no cubre algún carácter de aquí, el test lo avisa.
 */
const RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e], // ASCII imprimible
  [0xa0, 0xff], // Latin-1 (á é í ó ú ñ ü ¿ ¡ …)
  [0x100, 0x17f], // Latin Extended-A (ć č ł ő ş …)
  [0x2013, 0x2014], // – —
  [0x2018, 0x201d], // ‘ ’ “ ”
  [0x2022, 0x2022], // •
  [0x2026, 0x2026], // …
  [0x20ac, 0x20ac], // €
];

/**
 * Dentro de los rangos de arriba, Address Sans Pro Cd Semibold NO trae estos 8
 * caracteres (comprobado con fontkit; un test lo vigila). Se excluyen para
 * avisar en el formulario en lugar de imprimir un glifo vacío en el metal.
 */
const MISSING_IN_PIECE_FONT = new Set([0x5e, 0x7e, 0xa0, 0xa4, 0xac, 0xad, 0x17f, 0x201b]);

export const isSupportedChar = (char: string): boolean => {
  const code = char.codePointAt(0);
  return code !== undefined && !MISSING_IN_PIECE_FONT.has(code) && RANGES.some(([from, to]) => code >= from && code <= to);
};

/** Caracteres de un texto que ninguna fuente de la plantilla cubrirá (para avisar en el formulario). */
export function findUnsupportedChars(text: string): string[] {
  return [...new Set([...text].filter((char) => !isSupportedChar(char)))];
}

export const SUPPORTED_CHARSET: string = RANGES.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)))
  .filter(isSupportedChar)
  .join("");
