import "server-only";

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import * as fontkit from "fontkit";

import { MissingFontError, type FontRegistry, type FontResolver, type LoadedFont, type PathCommand, type ShapedGlyph } from "@/lib/document/fonts";
import type { FontRef, Template } from "@/types";

type FontkitCommand = { command: string; args: number[] };

function toCommands(commands: readonly FontkitCommand[]): PathCommand[] {
  return commands.flatMap((c): PathCommand[] => {
    const a = c.args;
    switch (c.command) {
      case "moveTo":
        return [{ type: "M", x: a[0] ?? 0, y: a[1] ?? 0 }];
      case "lineTo":
        return [{ type: "L", x: a[0] ?? 0, y: a[1] ?? 0 }];
      case "quadraticCurveTo":
        return [{ type: "Q", x1: a[0] ?? 0, y1: a[1] ?? 0, x: a[2] ?? 0, y: a[3] ?? 0 }];
      case "bezierCurveTo":
        return [{ type: "C", x1: a[0] ?? 0, y1: a[1] ?? 0, x2: a[2] ?? 0, y2: a[3] ?? 0, x: a[4] ?? 0, y: a[5] ?? 0 }];
      case "closePath":
        return [{ type: "Z" }];
      default:
        return [];
    }
  });
}

class FontkitLoadedFont implements LoadedFont {
  constructor(
    private readonly font: fontkit.Font,
    readonly filePath: string,
  ) {}

  get unitsPerEm() {
    return this.font.unitsPerEm;
  }
  get capHeight() {
    return this.font.capHeight;
  }
  get ascent() {
    return this.font.ascent;
  }
  get descent() {
    return this.font.descent;
  }

  hasGlyph(codePoint: number): boolean {
    return this.font.hasGlyphForCodePoint(codePoint);
  }

  shape(text: string): ShapedGlyph[] {
    const run = this.font.layout(text);
    return run.glyphs.map((glyph, index) => {
      const position = run.positions[index];
      return {
        advance: position?.xAdvance ?? glyph.advanceWidth,
        xOffset: position?.xOffset ?? 0,
        yOffset: position?.yOffset ?? 0,
        outline: () => toCommands(glyph.path.commands as FontkitCommand[]),
      };
    });
  }
}

/**
 * Registro de fuentes en disco: assets/fonts/<fontDir>/<archivo>. Comparte
 * motor (fontkit) con pdfkit, así la medida del texto coincide con la del PDF.
 */
export class NodeFontRegistry implements FontRegistry {
  private readonly cache = new Map<string, FontkitLoadedFont>();

  constructor(private readonly baseDir: string) {}

  private load(path: string): FontkitLoadedFont {
    const cached = this.cache.get(path);
    if (cached) return cached;
    if (!existsSync(path)) {
      throw new Error(`Falta el archivo de fuente ${path}. Ejecuta \`bun run fonts:setup\` (Gotham no está en git).`);
    }
    const opened = fontkit.openSync(path);
    if (!("layout" in opened)) throw new Error(`${path} es una colección de fuentes; se esperaba un archivo individual`);
    const font = new FontkitLoadedFont(opened, path);
    this.cache.set(path, font);
    return font;
  }

  forTemplate(template: Pick<Template, "fontDir" | "fonts">): FontResolver {
    return (ref: FontRef) => {
      const declared = template.fonts.find((f) => f.family === ref.family && f.weight === ref.weight && f.style === ref.style);
      if (!declared) throw new MissingFontError(ref);
      return this.load(join(this.baseDir, template.fontDir, declared.file));
    };
  }
}

/**
 * Carpeta de fuentes (assets/fonts). La ruta se resuelve en ejecución a propósito:
 * `outputFileTracingIncludes` (next.config.ts) ya copia assets/fonts a la imagen, y
 * `turbopackIgnore` evita que Turbopack trace TODO el proyecto por este acceso dinámico.
 */
export const resolveFontsDir = (configured: string): string => resolve(/* turbopackIgnore: true */ process.cwd(), configured);
