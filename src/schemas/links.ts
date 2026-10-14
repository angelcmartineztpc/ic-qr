import { z } from "zod";

import { MAX_URL_LENGTH, SafeHttpUrlSchema } from "./url";

/** Alfabeto del código: minúsculas y dígitos sin caracteres ambiguos (sin 0, 1, i, l, o). */
export const SHORT_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const SHORT_CODE_LENGTH = 8;
export const SHORT_CODE_PATTERN = /^[2-9a-hjkmnp-z]{8}$/;
export const SHORT_LINK_PATH = "/s/";
export const SHORT_LINK_HISTORY_MAX = 20;
export const SHORTEN_MAX_BATCH = 200;

export const ShortCodeSchema = z.string().regex(SHORT_CODE_PATTERN, { error: "Código de link corto no válido" });

/** Destino de un link corto: URL http(s) válida y de longitud acotada. */
export const DestinationSchema = SafeHttpUrlSchema.transform((s) => new URL(s).href).refine((s) => s.length <= MAX_URL_LENGTH, { error: "El destino es demasiado largo" });

/** Registro guardado de un link corto: `[prefijo/]s/v1/{código}.json`. */
export const ShortLinkSchema = z.strictObject({
  v: z.literal(1),
  code: ShortCodeSchema,
  /** Destino vigente: a donde redirige hoy. */
  destination: z.string().max(MAX_URL_LENGTH),
  /** El link que se acortó la primera vez; de él sale el código y no cambia nunca. */
  originalUrl: z.string().max(MAX_URL_LENGTH),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
  /** Destinos anteriores (el más reciente primero). */
  history: z.array(z.strictObject({ destination: z.string().max(MAX_URL_LENGTH), at: z.iso.datetime({ offset: true }) })).max(SHORT_LINK_HISTORY_MAX),
});

export const ShortenRequestSchema = z.strictObject({
  urls: z.array(z.string().max(MAX_URL_LENGTH * 2)).min(1).max(SHORTEN_MAX_BATCH),
});

/** created = código nuevo · reused = ya existía · kept = ya era un link propio · invalid = no es un link válido. */
export const SHORTEN_STATUSES = ["created", "reused", "kept", "invalid"] as const;

export const ShortenItemSchema = z.strictObject({
  url: z.string(),
  status: z.enum(SHORTEN_STATUSES),
  shortUrl: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
});

export const ShortenResponseSchema = z.strictObject({ results: z.array(ShortenItemSchema) });

export const UpdateDestinationRequestSchema = z.strictObject({ destination: z.string().max(MAX_URL_LENGTH * 2) });

/** Lo que ve la interfaz de un link corto. */
export const LinkInfoSchema = z.strictObject({
  code: ShortCodeSchema,
  shortUrl: z.string(),
  destination: z.string(),
  originalUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number(),
  history: ShortLinkSchema.shape.history,
});

export type ShortLink = z.output<typeof ShortLinkSchema>;
export type ShortenStatus = (typeof SHORTEN_STATUSES)[number];
export type ShortenItem = z.output<typeof ShortenItemSchema>;
export type ShortenResponse = z.output<typeof ShortenResponseSchema>;
export type LinkInfo = z.output<typeof LinkInfoSchema>;

/** Piezas para el Excel actualizado: solo lo que lleva el archivo (el servidor añade el destino de cada link corto). */
export const RECORDS_EXCEL_MAX_ROWS = 5000;
export const RecordsExcelRequestSchema = z.strictObject({
  records: z
    .array(
      z.strictObject({
        area: z.string().max(2048),
        estacion: z.string().max(2048),
        mesa: z.string().max(2048),
        subgrupo: z.string().max(2048),
        concepto: z.string().max(2048),
        menuUrl: z.string().max(MAX_URL_LENGTH * 2),
        /** Solo el Link del QR que la persona aportó; un QR generado por la herramienta NO se escribe. */
        qrUrl: z.string().max(MAX_URL_LENGTH * 2).optional(),
      }),
    )
    .min(1)
    .max(RECORDS_EXCEL_MAX_ROWS),
});
export type RecordsExcelRequest = z.output<typeof RecordsExcelRequestSchema>;
