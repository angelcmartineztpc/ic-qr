import { TemplateSchema } from "@/schemas/template";
import type { Template } from "@/types";

import { customTemplate } from "./custom-template/template";
import { restaurantDefault } from "./restaurant-default/template";
import { tropicalTable } from "./tropical-table/template";

/** Registro de plantillas: se validan al cargar el módulo (una plantilla inválida rompe el build y los tests). */
const DEFINITIONS = [tropicalTable, restaurantDefault, customTemplate];

export const TEMPLATES: ReadonlyMap<string, Template> = new Map(
  DEFINITIONS.map((definition) => {
    const template = TemplateSchema.parse(definition);
    return [template.id, template] as const;
  }),
);

export const DEFAULT_TEMPLATE_ID = "tropical-table";

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.get(id);
}

export function listTemplates(): Template[] {
  return [...TEMPLATES.values()];
}
