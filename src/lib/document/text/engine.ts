/**
 * Motor de texto: medida, ajuste (shrink / wrap) y colocación del bloque de
 * datos. Puro: trabaja con un `LoadedFont` abstracto (fontkit en el servidor).
 * Todo en mm; el tamaño de letra se declara en pt (1 pt = 0.352778 mm).
 */
import { findUnsupportedChars } from "../charset";
import type { LoadedFont } from "../fonts";
import { PT_TO_MM, round } from "@/lib/units";
import type { FontRef, TextElement, TextFit } from "@/types";

export interface MeasuredText {
  /** Ancho visual en mm (sin el tracking tras el último glifo). */
  widthMm: number;
}

/** Ancho de una línea en mm con kerning y tracking (1/1000 em, como Illustrator). */
export function measureLine(font: LoadedFont, text: string, sizePt: number, trackingEm1000: number): number {
  const glyphs = font.shape(text);
  if (glyphs.length === 0) return 0;
  const scale = (sizePt * PT_TO_MM) / font.unitsPerEm;
  const advance = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0) * scale;
  const tracking = (trackingEm1000 / 1000) * sizePt * PT_TO_MM * (glyphs.length - 1);
  return advance + tracking;
}

export interface FittedText {
  lines: string[];
  sizePt: number;
  /** Ancho de la línea más ancha. */
  widthMm: number;
  /** El texto no cabe ni en el tamaño mínimo / número de líneas permitido. */
  overflowX: boolean;
}

const fits = (width: number, max: number) => width <= max + 1e-9;

/** Reduce el tamaño en pasos de 0.1 pt hasta caber; si no cabe en el mínimo, desborda (aviso). */
function shrinkToFit(font: LoadedFont, text: string, element: TextElement, maxWidthMm: number, minSizePt: number): FittedText {
  const measure = (size: number) => measureLine(font, text, size, element.trackingEm1000);
  let size = element.sizePt;
  let width = measure(size);
  if (fits(width, maxWidthMm)) return { lines: [text], sizePt: size, widthMm: width, overflowX: false };

  // Tamaño exacto proporcional (el ancho escala con el tamaño) y redondeo hacia abajo a 0.1 pt.
  const ideal = Math.floor(((size * maxWidthMm) / width) * 10) / 10;
  size = Math.max(minSizePt, Math.min(element.sizePt, ideal));
  width = measure(size);
  while (!fits(width, maxWidthMm) && size > minSizePt) {
    size = Math.max(minSizePt, round(size - 0.1, 0.1));
    width = measure(size);
  }
  return { lines: [text], sizePt: size, widthMm: width, overflowX: !fits(width, maxWidthMm) };
}

/** Parte por palabras en hasta `maxLines` líneas que quepan en el ancho. */
function wrapWords(font: LoadedFont, text: string, element: TextElement, sizePt: number, maxWidthMm: number, maxLines: number) {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && !fits(measureLine(font, candidate, sizePt, element.trackingEm1000), maxWidthMm)) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const widths = lines.map((line) => measureLine(font, line, sizePt, element.trackingEm1000));
  return {
    lines,
    widthMm: Math.max(0, ...widths),
    ok: lines.length <= maxLines && widths.every((w) => fits(w, maxWidthMm)),
  };
}

export function fitText(font: LoadedFont, text: string, element: TextElement, maxWidthMm: number): FittedText {
  const fit: TextFit = element.fit;
  switch (fit.mode) {
    case "none": {
      const width = measureLine(font, text, element.sizePt, element.trackingEm1000);
      return { lines: [text], sizePt: element.sizePt, widthMm: width, overflowX: !fits(width, maxWidthMm) };
    }
    case "shrink":
      return shrinkToFit(font, text, element, maxWidthMm, fit.minSizePt);
    case "wrap": {
      const minSize = fit.minSizePt ?? element.sizePt;
      // prefer 'shrink': primero una línea reducida; si no, parte en líneas.
      if (fit.prefer === "shrink") {
        const single = shrinkToFit(font, text, element, maxWidthMm, minSize);
        if (!single.overflowX) return single;
      }
      for (let size = element.sizePt; size >= minSize - 1e-9; size = round(size - 0.1, 0.1)) {
        const wrapped = wrapWords(font, text, element, size, maxWidthMm, fit.maxLines);
        if (wrapped.ok) return { lines: wrapped.lines, sizePt: size, widthMm: wrapped.widthMm, overflowX: false };
      }
      const last = wrapWords(font, text, element, minSize, maxWidthMm, fit.maxLines);
      return { lines: last.lines.slice(0, fit.maxLines), sizePt: minSize, widthMm: last.widthMm, overflowX: true };
    }
  }
}

/** Reemplaza {{campo}}; los campos ausentes dejan cadena vacía. */
export function resolveText(source: string, values: Readonly<Record<string, string>>): { text: string; hadPlaceholders: boolean; allEmpty: boolean } {
  let placeholders = 0;
  let empty = 0;
  const text = source.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_match, name: string) => {
    placeholders++;
    const value = values[name] ?? "";
    if (value === "") empty++;
    return value;
  });
  return { text: text.replace(/\s+/g, " ").trim(), hadPlaceholders: placeholders > 0, allEmpty: placeholders > 0 && empty === placeholders };
}

export function applyTransform(text: string, transform: TextElement["transform"]): string {
  return transform === "uppercase" ? text.toLocaleUpperCase("es") : text;
}

export interface MissingGlyph {
  char: string;
}

/** Caracteres sin glifo en la fuente o fuera del juego admitido (aviso MISSING_GLYPH). */
export function missingGlyphs(font: LoadedFont, text: string): string[] {
  const outside = findUnsupportedChars(text);
  const noGlyph = [...new Set([...text].filter((char) => char.trim() !== "" && !font.hasGlyph(char.codePointAt(0) ?? 0)))];
  return [...new Set([...outside, ...noGlyph])];
}

export type { FontRef };
