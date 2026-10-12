import type { z } from "zod";

import type { BoxSchema, LayoutOverrideSchema, LayoutSchema, ProjectLayoutSchema } from "@/schemas/geometry";

import type { Mm } from "./common";

export type Box = z.output<typeof BoxSchema>;
/** Spec §15: posiciones en mm. */
export type Layout = z.output<typeof LayoutSchema>;
export type LayoutOverride = z.output<typeof LayoutOverrideSchema>;
export type ProjectLayout = z.output<typeof ProjectLayoutSchema>;
export type LayoutBoxKey = keyof Layout;

/** Spec §47. */
export type QrPreset = "bottom-center" | "bottom-left" | "bottom-right" | "center" | "custom";

export interface TileSpec {
  width: Mm;
  height: Mm;
  safeMarginMm: Mm;
}

export type LayoutWarning =
  | { code: "OVERLAP"; between: ["qr", "content"] }
  | { code: "OUTSIDE_SAFE_MARGIN"; box: LayoutBoxKey }
  | { code: "QR_MODULE_SMALL"; moduleMm: number; level: "warn" | "block" }
  | { code: "QR_NO_WHITE_BACKGROUND" }
  | { code: "TEXT_OVERFLOW"; elementId: string; axis: "x" | "y" }
  | { code: "MISSING_GLYPH"; elementId: string; char: string };
