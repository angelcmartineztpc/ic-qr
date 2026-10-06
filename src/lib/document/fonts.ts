import type { FontRef, Template } from "@/types";

/** Comando de path en unidades de fuente (y hacia arriba), solo absolutos. */
export type PathCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "Q"; x1: number; y1: number; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "Z" };

export interface ShapedGlyph {
  /** Avance horizontal en unidades de fuente (incluye kerning). */
  advance: number;
  xOffset: number;
  yOffset: number;
  /** Contorno del glifo en unidades de fuente (y hacia arriba). */
  outline(): PathCommand[];
}

/**
 * Puerto de fuentes. El motor de texto no depende de fontkit: el servidor lo
 * implementa con fontkit (server/fonts) y los tests con una fuente falsa.
 */
export interface LoadedFont {
  unitsPerEm: number;
  capHeight: number;
  ascent: number;
  descent: number;
  hasGlyph(codePoint: number): boolean;
  shape(text: string): ShapedGlyph[];
  /** Archivo en disco (el PDF en modo texto vivo lo incrusta). */
  readonly filePath?: string;
}

export type FontResolver = (font: FontRef) => LoadedFont;

export interface FontRegistry {
  /** Resuelve una fuente declarada por la plantilla (familia, peso y estilo). */
  forTemplate(template: Pick<Template, "fontDir" | "fonts">): FontResolver;
}

export class MissingFontError extends Error {
  constructor(readonly font: FontRef) {
    super(`Fuente no declarada por la plantilla: ${font.family} ${font.weight} ${font.style}`);
    this.name = "MissingFontError";
  }
}
