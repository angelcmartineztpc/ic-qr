import { z } from "zod";

import { ProjectLayoutSchema, TemplateIdSchema } from "./geometry";
import { QrSourceInfoSchema } from "./record";
import { TemplateOverridesSchema } from "./template";

export const PREVIEW_MAX_TILES = 48;

/**
 * Lo mínimo para dibujar una pieza (campos tolerantes: la vista previa debe
 * mostrar también piezas con errores mientras el usuario escribe).
 */
export const PreviewTileSchema = z.strictObject({
  /** Clave de caché del cliente; el servidor la devuelve tal cual. */
  key: z.string().min(1).max(200),
  recordId: z.string().min(1).max(64),
  area: z.string().max(2048),
  estacion: z.string().max(2048),
  mesa: z.string().max(2048),
  subgrupo: z.string().max(2048),
  concepto: z.string().max(2048),
  menuUrl: z.string().max(4096),
  qr: QrSourceInfoSchema,
  qrUrl: z.string().max(4096).optional(),
});

export const PreviewRequestSchema = z.strictObject({
  templateId: TemplateIdSchema,
  templateOverrides: TemplateOverridesSchema,
  layout: ProjectLayoutSchema,
  /** 'low' para miniaturas (sin módulos ni glifos). */
  detail: z.enum(["full", "low"]).default("full"),
  tiles: z.array(PreviewTileSchema).min(1).max(PREVIEW_MAX_TILES),
});

export type PreviewTile = z.output<typeof PreviewTileSchema>;
export type PreviewRequest = z.output<typeof PreviewRequestSchema>;
export type PreviewRequestInput = z.input<typeof PreviewRequestSchema>;

export interface PreviewTileResult {
  svg: string;
  /** Avisos de composición (texto que no cabe, módulo pequeño, glifo ausente…) para mostrarlos en la pieza. */
  warnings: Array<{ code: string; [detail: string]: unknown }>;
}

export interface PreviewResponse {
  tiles: Record<string, PreviewTileResult>;
}
