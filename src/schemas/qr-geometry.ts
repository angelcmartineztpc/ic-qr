import { z } from "zod";

import { ColorSchema } from "./geometry";

/**
 * Geometría saneada de un QR externo (instantánea). Se valida SIEMPRE al leerla
 * del storage: nada que venga de fuera llega al renderer sin pasar por aquí.
 */
export const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]*$/;
export const MAX_GEOMETRY_NODES = 5000;
export const MAX_PATH_LENGTH = 500_000;

const Num = z.number().finite().min(-1e6).max(1e6);
const MatrixSchema = z.tuple([Num, Num, Num, Num, Num, Num]);

export const ExternalNodeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("path"),
    d: z.string().max(MAX_PATH_LENGTH).regex(PATH_DATA),
    fill: z.union([ColorSchema, z.literal("none")]),
    fillRule: z.enum(["nonzero", "evenodd"]),
    stroke: ColorSchema.optional(),
    strokeWidth: z.number().min(0).max(1000).optional(),
    transform: MatrixSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("rect"),
    x: Num,
    y: Num,
    w: z.number().min(0).max(1e6),
    h: z.number().min(0).max(1e6),
    fill: ColorSchema,
    transform: MatrixSchema.optional(),
  }),
]);

export const ExternalGeometrySchema = z.strictObject({
  viewBox: z.tuple([Num, Num, z.number().positive().max(20000), z.number().positive().max(20000)]),
  nodes: z.array(ExternalNodeSchema).max(MAX_GEOMETRY_NODES),
  strokeBased: z.boolean(),
});

/** Contenido de qr/ext/v1/{assetSha256}.json */
export const ExternalSnapshotSchema = z.strictObject({
  v: z.literal(1),
  assetSha256: z.string().regex(/^[0-9a-f]{64}$/),
  geometry: ExternalGeometrySchema,
});

export type ExternalGeometry = z.output<typeof ExternalGeometrySchema>;
export type ExternalSnapshot = z.output<typeof ExternalSnapshotSchema>;
