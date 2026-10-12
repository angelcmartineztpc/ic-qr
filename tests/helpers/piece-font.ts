import { existsSync } from "node:fs";
import { join } from "node:path";

import { NodeFontRegistry } from "@/server/fonts/node-font-registry";
import { buildScene, type SceneRecord } from "@/lib/document/scene";
import { encodeMatrix } from "@/lib/qr/encode";
import { getTemplate } from "@/templates";
import type { QrGeometry, Template } from "@/types";

export const FONTS_DIR = join(process.cwd(), "assets", "fonts");
/** La fuente de las piezas no está en git: los tests que la necesitan se saltan si no está instalada (`bun run fonts:setup`). */
export const HAS_PIECE_FONT = existsSync(join(FONTS_DIR, "address-sans", "AddressSansPro-CdSemibold.woff2"));
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
