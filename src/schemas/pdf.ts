import { z } from "zod";

/** Opciones del PDF (§19). Los valores por defecto son literales centralizados y un test los parsea. */
export const PageSizeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("A4") }),
  z.strictObject({ kind: z.literal("Letter") }),
  z.strictObject({ kind: z.literal("custom"), widthMm: z.number().min(10).max(1500), heightMm: z.number().min(10).max(1500) }),
]);

const MarginMm = z.number().min(0).max(100);

export const PDF_DEFAULTS = {
  mode: "sheet",
  pageSize: { kind: "A4" },
  orientation: "portrait",
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  gapMm: 5,
  bleedMm: 0,
  center: true,
  textMode: "outlined",
  cutLine: "none",
  colorSpace: "rgb",
  includeQrBackground: true,
} as const;

export const PDFOptionsSchema = z.strictObject({
  mode: z.enum(["sheet", "single"]).default(PDF_DEFAULTS.mode),
  pageSize: PageSizeSchema.default(PDF_DEFAULTS.pageSize),
  orientation: z.enum(["portrait", "landscape", "auto"]).default(PDF_DEFAULTS.orientation),
  margins: z
    .strictObject({ top: MarginMm, right: MarginMm, bottom: MarginMm, left: MarginMm })
    .default(PDF_DEFAULTS.margins),
  gapMm: z.number().min(0).max(50).default(PDF_DEFAULTS.gapMm),
  bleedMm: z.number().min(0).max(5).default(PDF_DEFAULTS.bleedMm),
  maxCols: z.number().int().min(1).max(50).optional(),
  maxRows: z.number().int().min(1).max(50).optional(),
  center: z.boolean().default(PDF_DEFAULTS.center),
  textMode: z.enum(["outlined", "live"]).default(PDF_DEFAULTS.textMode),
  cutLine: z.enum(["none", "rgb", "spot"]).default(PDF_DEFAULTS.cutLine),
  colorSpace: z.enum(["rgb", "cmyk"]).default(PDF_DEFAULTS.colorSpace),
  includeQrBackground: z.boolean().default(PDF_DEFAULTS.includeQrBackground),
});
