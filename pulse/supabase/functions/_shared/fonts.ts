/**
 * Registro de fuentes con fontkit (el mismo motor que pdfkit: la medida del texto coincide con la del PDF).
 * Las tipografías comerciales viven en el bucket privado `qr-fuentes` (`<fontDir>/<archivo>`) y se cargan
 * en memoria una vez por instancia; el resto del código es síncrono y las encuentra ya cargadas.
 */
import { Buffer } from "node:buffer";

import * as fontkit from "fontkit";

import { HttpError } from "@/services/qr-produccion/backend/http/errors.ts";
import { MissingFontError, type FontRegistry, type FontResolver, type LoadedFont, type PathCommand, type ShapedGlyph } from "@/services/qr-produccion/document/fonts.ts";
import { getTemplate } from "@/services/qr-produccion/templates/index.ts";
import type { FontRef, Template } from "@/types";

import { log } from "./log.ts";
import { fontsBucket } from "./storage.ts";

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
    readonly bytes: Uint8Array,
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

const loaded = new Map<string, FontkitLoadedFont>();
const loading = new Map<string, Promise<void>>();

async function loadFile(path: string): Promise<void> {
  if (loaded.has(path)) return;
  let pending = loading.get(path);
  if (!pending) {
    pending = (async () => {
      const { data, error } = await fontsBucket().download(path);
      if (error || !data) throw new Error(`Falta el archivo de fuente ${path} en el bucket de fuentes (qr-fuentes)`);
      const bytes = new Uint8Array(await data.arrayBuffer());
      const opened = fontkit.create(Buffer.from(bytes));
      if (!("layout" in opened)) throw new Error(`${path} es una colección de fuentes; se esperaba un archivo individual`);
      loaded.set(path, new FontkitLoadedFont(opened, bytes));
    })().finally(() => loading.delete(path));
    loading.set(path, pending);
  }
  await pending;
}

const registry: FontRegistry = {
  forTemplate(template: Pick<Template, "fontDir" | "fonts">): FontResolver {
    return (ref: FontRef) => {
      const declared = template.fonts.find((f) => f.family === ref.family && f.weight === ref.weight && f.style === ref.style);
      if (!declared) throw new MissingFontError(ref);
      const font = loaded.get(`${template.fontDir}/${declared.file}`);
      if (!font) throw new Error(`Falta el archivo de fuente ${template.fontDir}/${declared.file}. Súbelo al bucket «qr-fuentes».`);
      return font;
    };
  },
};

/** Carga (si hace falta) las fuentes de la plantilla y devuelve el registro. Una plantilla desconocida no carga nada: la valida quien llama. */
export async function fontRegistryFor(templateId: string): Promise<FontRegistry> {
  const template = getTemplate(templateId);
  if (!template) return registry;
  try {
    await Promise.all(template.fonts.map((font) => loadFile(`${template.fontDir}/${font.file}`)));
  } catch (error) {
    log.error("No se pudieron cargar las fuentes", { templateId, error: error instanceof Error ? error.message : String(error) });
    throw new HttpError(503, "FONTS_MISSING", "Faltan las fuentes de las piezas en el servidor (súbelas al bucket «qr-fuentes»)");
  }
  return registry;
}
