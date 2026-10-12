import { z } from "zod";

import { BoxSchema, ColorSchema, LayoutSchema, MmSchema, PtSchema, TemplateIdSchema } from "./geometry";
import { BindableFieldSchema } from "./record";

/**
 * Plantillas como datos (§16): la estructura vive en src/templates/* y el
 * usuario solo ajusta un subconjunto validado (TemplateOverrides).
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

export const TextSourceSchema = z
  .string()
  .min(1)
  .max(500)
  .superRefine((source, ctx) => {
    for (const match of source.matchAll(PLACEHOLDER)) {
      if (!BindableFieldSchema.safeParse(match[1]).success) {
        ctx.addIssue({ code: "custom", message: `Campo desconocido {{${match[1] ?? ""}}}` });
      }
    }
  });

export const FontRefSchema = z.strictObject({
  family: z.string().min(1),
  weight: z.number().int().min(100).max(900),
  style: z.enum(["normal", "italic"]).default("normal"),
});

export const FitSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("none") }),
  z.strictObject({ mode: z.literal("shrink"), minSizePt: PtSchema }),
  z.strictObject({
    mode: z.literal("wrap"),
    maxLines: z.number().int().min(1).max(6),
    minSizePt: PtSchema.optional(),
    prefer: z.enum(["shrink", "wrap"]).default("shrink"),
  }),
]);

const Pct = z.number().min(0).max(100);
export const PdfPaintSchema = z.union([
  z.strictObject({ cmyk: z.tuple([Pct, Pct, Pct, Pct]) }),
  z.strictObject({ spot: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/), cmyk: z.tuple([Pct, Pct, Pct, Pct]) }),
]);

const ElementIdSchema = z.string().regex(/^[a-zA-Z][\w-]*$/);

export const TextElementSchema = z.strictObject({
  type: z.literal("text"),
  id: ElementIdSchema,
  text: TextSourceSchema,
  font: FontRefSchema,
  sizePt: PtSchema,
  trackingEm1000: z.number().min(-200).max(1000).default(0),
  lineHeight: z.number().min(0.5).max(3).default(1.15),
  align: z.enum(["start", "center", "end"]).default("center"),
  transform: z.enum(["none", "uppercase"]).default("none"),
  color: ColorSchema.default("#000000"),
  pdfColor: PdfPaintSchema.optional(),
  fit: FitSchema.default({ mode: "none" }),
  marginTopMm: MmSchema.min(0).default(0),
  hideWhenEmpty: z.boolean().default(true),
});

export const ShapeElementSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("rect"),
    id: z.string(),
    box: BoxSchema,
    radiusMm: MmSchema.min(0).default(0),
    fill: ColorSchema.optional(),
    stroke: ColorSchema.optional(),
    strokeWidthPt: z.number().min(0).max(10).default(0.25),
    role: z.enum(["artwork", "dieline"]).default("artwork"),
  }),
  z.strictObject({
    type: z.literal("line"),
    id: z.string(),
    x1: MmSchema,
    y1: MmSchema,
    x2: MmSchema,
    y2: MmSchema,
    stroke: ColorSchema,
    strokeWidthPt: z.number().positive().max(10),
  }),
]);

export const FontFileSchema = FontRefSchema.extend({ file: z.string().regex(/^[\w.-]+\.(ttf|otf|woff2?)$/) });

export const TemplateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: TemplateIdSchema,
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    tile: z.strictObject({
      width: MmSchema.positive(),
      height: MmSchema.positive(),
      safeMarginMm: MmSchema.min(0).default(2),
      background: ColorSchema.optional(),
      cornerRadiusMm: MmSchema.min(0).default(0),
    }),
    /** Carpeta de assets/fonts donde están los archivos (p. ej. "address-sans"). */
    fontDir: z.string().regex(/^[a-z0-9-]+$/),
    fonts: z.array(FontFileSchema).min(1),
    defaultLayout: LayoutSchema,
    content: z.strictObject({
      verticalAlign: z.enum(["start", "center", "end"]).default("start"),
      vMetric: z.enum(["cap", "line"]).default("cap"),
      items: z.array(TextElementSchema).min(1).max(20),
    }),
    qr: z.strictObject({
      quietZoneModules: z.number().int().min(0).max(8).default(2),
      foreground: ColorSchema.default("#000000"),
      background: ColorSchema.default("#FFFFFF"),
      invert: z.boolean().default(false),
      minModuleMm: z.number().positive().default(0.45),
      warnModuleMm: z.number().positive().default(0.6),
    }),
    shapes: z.array(ShapeElementSchema).default([]),
  })
  .superRefine((template, ctx) => {
    const inside = (box: z.output<typeof BoxSchema>) =>
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= template.tile.width + 1e-9 &&
      box.y + box.height <= template.tile.height + 1e-9;
    if (!inside(template.defaultLayout.qr)) {
      ctx.addIssue({ code: "custom", path: ["defaultLayout", "qr"], message: "QR fuera de la pieza" });
    }
    if (!inside(template.defaultLayout.content)) {
      ctx.addIssue({ code: "custom", path: ["defaultLayout", "content"], message: "Bloque de texto fuera de la pieza" });
    }
    const ids = new Set<string>();
    template.content.items.forEach((item, index) => {
      if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["content", "items", index, "id"], message: `Id repetido: ${item.id}` });
      ids.add(item.id);
      const declared = template.fonts.some(
        (font) => font.family === item.font.family && font.weight === item.font.weight && font.style === item.font.style,
      );
      if (!declared) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "items", index, "font"],
          message: `Fuente ${item.font.family} ${item.font.weight} no declarada`,
        });
      }
    });
    if (template.qr.minModuleMm > template.qr.warnModuleMm) {
      ctx.addIssue({ code: "custom", path: ["qr", "minModuleMm"], message: "minModuleMm no puede superar warnModuleMm" });
    }
  });

/** Subconjunto editable por el usuario (§1.2-27). resolveTemplate() fusiona y re-valida. */
export const TemplateOverridesSchema = z.strictObject({
  items: z
    .record(
      ElementIdSchema,
      z.strictObject({
        text: z.string().min(1).max(500).optional(),
        sizePt: PtSchema.optional(),
        align: z.enum(["start", "center", "end"]).optional(),
        color: ColorSchema.optional(),
        weight: z.number().int().min(100).max(900).optional(),
        marginTopMm: MmSchema.min(0).optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .default({}),
  qr: z
    .strictObject({ quietZoneModules: z.number().int().min(0).max(8).optional(), foreground: ColorSchema.optional() })
    .default({}),
  tile: z.strictObject({ background: ColorSchema.optional() }).default({}),
});

export const EMPTY_TEMPLATE_OVERRIDES = { items: {}, qr: {}, tile: {} } as const;
