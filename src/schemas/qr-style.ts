import { z } from "zod";

import { ColorSchema } from "./geometry";
import { ExternalNodeSchema } from "./qr-geometry";

/**
 * Estilo visual del QR (paso «Estilo del QR»). Solo cambia CÓMO se dibuja la
 * matriz de módulos que ya existe; nunca el contenido ni el archivo del QR:
 * el SVG canónico guardado en el storage sigue siendo el mismo y un registro
 * con «Link del QR» conserva su recurso tal cual (el estilo no le aplica).
 */
export const QR_MODULE_SHAPES = ["square", "rounded", "extra-rounded", "dots", "classy", "classy-rounded"] as const;
export const QR_EYE_FRAME_SHAPES = ["square", "rounded", "circle"] as const;
export const QR_EYE_BALL_SHAPES = ["square", "rounded", "circle"] as const;
export const QR_OUTLINES = ["square", "circle"] as const;

/** Límites del logo: va en cada petición de vista previa y de exportación, así que se mantiene pequeño. */
export const LOGO_MAX_NODES = 200;
export const LOGO_MAX_PATH_CHARS = 60_000;
export const LOGO_MIN_SIZE_PCT = 5;
export const LOGO_MAX_SIZE_PCT = 30;

/** Logo ya saneado: solo geometría (paths y rectángulos con relleno), nunca el SVG original. */
export const QrLogoGeometrySchema = z
  .strictObject({
    viewBox: z.tuple([z.number().finite(), z.number().finite(), z.number().positive().max(20000), z.number().positive().max(20000)]),
    nodes: z.array(ExternalNodeSchema).min(1).max(LOGO_MAX_NODES),
  })
  .refine((geometry) => geometry.nodes.reduce((sum, node) => sum + (node.type === "path" ? node.d.length : 0), 0) <= LOGO_MAX_PATH_CHARS, {
    error: "El logo es demasiado detallado: simplifícalo antes de subirlo",
  });

export const QrLogoSchema = z.strictObject({
  geometry: QrLogoGeometrySchema,
  /** Lado del logo como % del lado del QR. */
  sizePct: z.number().min(LOGO_MIN_SIZE_PCT).max(LOGO_MAX_SIZE_PCT),
  /** Margen libre de módulos alrededor del logo, en módulos. */
  marginModules: z.number().min(0).max(3),
  /** Un solo color para todo el logo; null conserva los colores del SVG. */
  color: ColorSchema.nullable(),
  /** Nombre del archivo subido (solo para mostrarlo). */
  fileName: z.string().max(120),
});

export const QrStyleColorsSchema = z.strictObject({
  /** null = el color del QR de la plantilla. */
  modules: ColorSchema.nullable(),
  /** null = igual que los módulos. */
  eyeFrame: ColorSchema.nullable(),
  eyeBall: ColorSchema.nullable(),
  /** null = el fondo del QR de la plantilla. */
  background: ColorSchema.nullable(),
});

export const QrStyleSchema = z.strictObject({
  outline: z.enum(QR_OUTLINES),
  modules: z.enum(QR_MODULE_SHAPES),
  eyeFrame: z.enum(QR_EYE_FRAME_SHAPES),
  eyeBall: z.enum(QR_EYE_BALL_SHAPES),
  colors: QrStyleColorsSchema,
  logo: QrLogoSchema.nullable(),
});

export const DEFAULT_QR_STYLE: z.output<typeof QrStyleSchema> = {
  outline: "square",
  modules: "square",
  eyeFrame: "square",
  eyeBall: "square",
  colors: { modules: null, eyeFrame: null, eyeBall: null, background: null },
  logo: null,
};

export type QrStyle = z.output<typeof QrStyleSchema>;
export type QrLogo = z.output<typeof QrLogoSchema>;
export type QrLogoGeometry = z.output<typeof QrLogoGeometrySchema>;
export type QrStyleInput = z.input<typeof QrStyleSchema>;
