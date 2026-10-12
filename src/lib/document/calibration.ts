/**
 * Hoja de calibración para el taller (docs/ARCHITECTURE.md §1.2-12).
 *
 * Los umbrales de módulo del QR (0.60 mm aviso, 0.45 mm bloqueo) y el texto
 * mínimo de 5 pt son estimaciones, no datos medidos sobre el material. Esta
 * hoja se graba en el metal real y el taller indica cuál es el QR más denso que
 * se lee y el texto más pequeño que se ve bien; con eso se ajustan los umbrales.
 *
 * Cada pieza lleva su etiqueta impresa (área = versión del QR, mesa = tamaño del
 * módulo en mm, o tamaño del texto) para identificarla en la placa.
 */
import { encodeMatrix, qrVersion } from "@/lib/qr/encode";
import { qrModuleMm } from "@/lib/layout/warnings";
import { resolveTemplate } from "@/lib/template/resolve";
import { TemplateOverridesSchema } from "@/schemas/template";
import type { Layout, QrGeometry, Template, TemplateOverrides } from "@/types";

import type { SceneRecord } from "./scene";

export const CALIBRATION_VERSIONS = [4, 5, 6, 7, 8, 9] as const;
export const CALIBRATION_TEXT_SIZES_PT = [4.5, 5, 5.5, 6] as const;

export interface CalibrationTile {
  label: string;
  template: Template;
  layout: Layout;
  record: SceneRecord;
  qr: QrGeometry;
}

const BASE_URL = "https://menu.example.com/c";

/** URL cuyo QR (corrección H) tiene exactamente la versión pedida, rellenando con una query. */
export function payloadForVersion(version: number): string {
  for (let padding = 0; padding < 400; padding++) {
    const payload = padding === 0 ? BASE_URL : `${BASE_URL}?${"q".repeat(padding - 1)}`;
    const current = qrVersion(encodeMatrix(payload).length);
    if (current === version) return payload;
    if (current > version) break;
  }
  throw new Error(`No se pudo construir una URL de versión ${version}`);
}

function overridesFor(sizePt: number): TemplateOverrides {
  return TemplateOverridesSchema.parse({ items: { ctaEs: { sizePt }, ctaEn: { sizePt } } });
}

export function calibrationTiles(template: Template): CalibrationTile[] {
  const tiles: CalibrationTile[] = [];

  for (const invert of [false, true]) {
    const base = invert ? resolveInverted(template) : template;
    for (const version of CALIBRATION_VERSIONS) {
      const payload = payloadForVersion(version);
      const matrix = encodeMatrix(payload);
      const modules = matrix.length;
      const moduleMm = qrModuleMm(base.defaultLayout.qr.width, modules, base.qr.quietZoneModules);
      tiles.push({
        label: `v${version}${invert ? " invertido" : ""}`,
        template: base,
        layout: base.defaultLayout,
        record: { id: `cal-qr-${version}${invert ? "-inv" : ""}`, area: `V${version}${invert ? " INV" : ""}`, estacion: "", mesa: `${moduleMm.toFixed(2)} MM`, subgrupo: "", concepto: "", menuUrl: payload },
        qr: { kind: "matrix", matrix, modules },
      });
    }
  }

  for (const size of CALIBRATION_TEXT_SIZES_PT) {
    const resolved = resolveTemplate(template, overridesFor(size));
    if (!resolved.success) throw new Error("Plantilla de calibración inválida");
    const payload = payloadForVersion(4);
    const matrix = encodeMatrix(payload);
    tiles.push({
      label: `texto ${size} pt`,
      template: resolved.data,
      layout: resolved.data.defaultLayout,
      record: { id: `cal-text-${size}`, area: "TEXTO", estacion: "", mesa: `${size} PT`, subgrupo: "", concepto: "", menuUrl: payload },
      qr: { kind: "matrix", matrix, modules: matrix.length },
    });
  }
  return tiles;
}

function resolveInverted(template: Template): Template {
  return { ...template, qr: { ...template.qr, invert: true } };
}
