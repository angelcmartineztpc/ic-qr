import type { z } from "zod";

import { TemplateSchema } from "@/schemas/template";
import type { ProjectLayout, Template, TemplateOverrides } from "@/types";


/**
 * Fusiona la plantilla con los ajustes del usuario y RE-VALIDA: un override con
 * un peso no declarado falla aquí, no en el render.
 */
export function resolveTemplate(base: Template, overrides: TemplateOverrides): z.ZodSafeParseResult<Template> {
  const merged = {
    ...base,
    tile: { ...base.tile, ...overrides.tile },
    qr: { ...base.qr, ...overrides.qr },
    content: {
      ...base.content,
      items: base.content.items.flatMap((item) => {
        const override = overrides.items[item.id];
        if (!override) return [item];
        if (override.hidden) return [];
        const { weight, hidden: _hidden, ...rest } = override;
        return [{ ...item, ...rest, font: weight === undefined ? item.font : { ...item.font, weight } }];
      }),
    },
  };
  return TemplateSchema.safeParse(merged);
}

/** Overrides que siguen aplicando a una plantilla (los de elementos que no existen se descartan). */
export function pruneOverrides(template: Template, overrides: TemplateOverrides): TemplateOverrides {
  const ids = new Set(template.content.items.map((item) => item.id));
  return {
    items: Object.fromEntries(Object.entries(overrides.items).filter(([id]) => ids.has(id))),
    qr: overrides.qr,
    tile: overrides.tile,
    qrStyle: overrides.qrStyle,
  };
}

export interface TemplateSwitch {
  layout: ProjectLayout;
  templateOverrides: TemplateOverrides;
  /** Posiciones personalizadas que se pierden (para el ConfirmDialog). */
  lostOverrides: number;
}

/** Cambiar de plantilla (§1.2-29): layout base nuevo, overrides de posición vaciados. Una sola entrada de deshacer. */
export function switchTemplate(next: Template, current: { layout: ProjectLayout; templateOverrides: TemplateOverrides }): TemplateSwitch {
  return {
    layout: { templateId: next.id, base: next.defaultLayout, overrides: {} },
    templateOverrides: pruneOverrides(next, current.templateOverrides),
    lostOverrides: Object.keys(current.layout.overrides).length,
  };
}
