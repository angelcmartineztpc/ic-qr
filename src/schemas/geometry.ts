import { z } from "zod";

/** Geometría en mm (fuente de verdad) y tipografía en pt. */
export const MmSchema = z.number().min(-1000).max(2000);
export const PtSchema = z.number().positive().max(500);
export const ColorSchema = z.templateLiteral(["#", z.string().regex(/^[0-9A-Fa-f]{6}$/)]);

export const BoxSchema = z.strictObject({
  x: MmSchema,
  y: MmSchema,
  width: MmSchema.positive(),
  height: MmSchema.positive(),
});

const isSquare = (box: { width: number; height: number }) => Math.abs(box.width - box.height) < 1e-6;

/** Spec §15: posiciones del QR y del bloque de datos. */
export const LayoutSchema = z
  .strictObject({ qr: BoxSchema, content: BoxSchema })
  .refine((layout) => isSquare(layout.qr), { error: "El área del QR debe ser cuadrada", path: ["qr"] });

export const LayoutOverrideSchema = z.strictObject({
  qr: BoxSchema.refine(isSquare, { error: "El área del QR debe ser cuadrada" }).optional(),
  content: BoxSchema.optional(),
});

export const TemplateIdSchema = z.string().regex(/^[a-z0-9-]+$/);

/** Layout del proyecto: base de la plantilla + overrides por pieza (§1.2-6). */
export const ProjectLayoutSchema = z.strictObject({
  templateId: TemplateIdSchema,
  base: LayoutSchema,
  overrides: z.record(z.string().min(1).max(64), LayoutOverrideSchema),
});
