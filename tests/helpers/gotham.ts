import { existsSync } from "node:fs";
import { join } from "node:path";

import { NodeFontRegistry } from "@/server/fonts/node-font-registry";
import { buildScene, type SceneRecord } from "@/lib/document/scene";
import { encodeMatrix } from "@/lib/qr/encode";
import { getTemplate } from "@/templates";
import type { QrGeometry, Template } from "@/types";

export const FONTS_DIR = join(process.cwd(), "assets", "fonts");
/** Gotham no está en git: los tests que la necesitan se saltan (con aviso) si no está instalada. */
export const HAS_GOTHAM = existsSync(join(FONTS_DIR, "gotham", "Gotham-Bold.otf"));
export const registry = new NodeFontRegistry(FONTS_DIR);

export function tropical(): Template {
  const template = getTemplate("tropical-table");
  if (!template) throw new Error("falta tropical-table");
  return template;
}

export const matrixGeometry = (payload: string): QrGeometry => {
  const matrix = encodeMatrix(payload);
  return { kind: "matrix", matrix, modules: matrix.length };
};

export function sampleRecord(overrides: Partial<SceneRecord> = {}): SceneRecord {
  return { id: "r1", area: "Tropical", estacion: "Bar", mesa: "M1", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/tropical", ...overrides };
}

export function sampleScene(overrides: Partial<SceneRecord> = {}, options?: Parameters<typeof buildScene>[0]["options"], template = tropical()) {
  const record = sampleRecord(overrides);
  return buildScene({
    template,
    layout: template.defaultLayout,
    record,
    qr: matrixGeometry(record.menuUrl),
    fonts: registry.forTemplate(template),
    ...(options ? { options } : {}),
  });
}
