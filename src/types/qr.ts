import type { z } from "zod";

import type { QrResolutionSchema, QrResolveItemSchema, QrVerifyItemSchema } from "@/schemas/api";

import type { HexColor } from "./common";

export interface QRRenderOptions {
  /** Único valor en el MVP (§1.2-12). */
  ecc: "high";
  marginModules: number;
  darkColor: HexColor;
  lightColor: HexColor;
  invert: boolean;
}

export type QrMatrix = boolean[][];
export type Matrix2D = [number, number, number, number, number, number];

export type ExternalNode =
  | {
      type: "path";
      d: string;
      fill: HexColor | "none";
      fillRule: "nonzero" | "evenodd";
      stroke?: HexColor;
      strokeWidth?: number;
      transform?: Matrix2D;
    }
  | { type: "rect"; x: number; y: number; w: number; h: number; fill: HexColor; transform?: Matrix2D };

export type QrGeometry =
  | { kind: "matrix"; matrix: QrMatrix; modules: number }
  | { kind: "external"; viewBox: [number, number, number, number]; nodes: ExternalNode[]; strokeBased: boolean };

export type QrResolveItem = z.output<typeof QrResolveItemSchema>;
export type QrVerifyItem = z.output<typeof QrVerifyItemSchema>;
export type QrResolution = z.output<typeof QrResolutionSchema>;
