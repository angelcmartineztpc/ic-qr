import type { z } from "zod";

import type {
  FitSchema,
  FontFileSchema,
  FontRefSchema,
  PdfPaintSchema,
  ShapeElementSchema,
  TemplateOverridesSchema,
  TemplateSchema,
  TextElementSchema,
} from "@/schemas/template";

export type FontRef = z.output<typeof FontRefSchema>;
export type FontFile = z.output<typeof FontFileSchema>;
export type TextFit = z.output<typeof FitSchema>;
export type PdfPaint = z.output<typeof PdfPaintSchema>;
export type TextElement = z.output<typeof TextElementSchema>;
export type ShapeElement = z.output<typeof ShapeElementSchema>;
export type Template = z.output<typeof TemplateSchema>;
/** Definición de plantilla tal como se escribe en src/templates/* (con defaults sin aplicar). */
export type TemplateInput = z.input<typeof TemplateSchema>;
export type TemplateOverrides = z.output<typeof TemplateOverridesSchema>;
