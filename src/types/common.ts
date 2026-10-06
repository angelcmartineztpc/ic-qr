import type { z } from "zod";

import type { ColorSchema } from "@/schemas/geometry";
import type { BindableFieldSchema, FieldKeySchema, SeveritySchema } from "@/schemas/record";

export type RecordId = string;
/** ISO-8601 con offset. */
export type IsoDateTime = string;
/** Milímetros: fuente de verdad geométrica. */
export type Mm = number;
/** Puntos tipográficos / PDF (1/72 in). */
export type Pt = number;
export type HexColor = z.output<typeof ColorSchema>;
export type Severity = z.output<typeof SeveritySchema>;
export type FieldKey = z.output<typeof FieldKeySchema>;
export type BindableField = z.output<typeof BindableFieldSchema>;
