import { DEFAULT_QR_STYLE, type QrLogo, type QrStyle } from "@/schemas/qr-style";
import type { ExternalNode, HexColor, QrMatrix } from "@/types";

import {
  bodyMatrix,
  eyeBallCommands,
  eyeFrameCommands,
  finderOrigins,
  moduleCommands,
  toPath,
  type Placement,
} from "./shapes";

/** ¿Es el QR clásico (cuadrado, sin colores propios ni logo)? Entonces se usa el camino de siempre, byte a byte. */
export function isDefaultQrStyle(style: QrStyle): boolean {
  return (
    style.outline === DEFAULT_QR_STYLE.outline &&
    style.modules === DEFAULT_QR_STYLE.modules &&
    style.eyeFrame === DEFAULT_QR_STYLE.eyeFrame &&
    style.eyeBall === DEFAULT_QR_STYLE.eyeBall &&
    style.logo === null &&
    Object.values(style.colors).every((color) => color === null)
  );
}

/** Con contorno circular el QR se inscribe en el círculo y se deja al menos esta zona de silencio (en módulos). */
export const CIRCLE_QUIET_MODULES = 2;

export interface StyleColors {
  modules: HexColor;
  eyeFrame: HexColor;
  eyeBall: HexColor;
  background: HexColor;
}

/** Colores efectivos: lo que el usuario eligió o, si no, los del QR de la plantilla. */
export function resolveStyleColors(style: QrStyle, base: { dark: HexColor; light: HexColor }): StyleColors {
  const modules = style.colors.modules ?? base.dark;
  return {
    modules,
    eyeFrame: style.colors.eyeFrame ?? modules,
    eyeBall: style.colors.eyeBall ?? style.colors.eyeFrame ?? modules,
    background: style.colors.background ?? base.light,
  };
}

/**
 * Tamaño de módulo y origen de la matriz dentro de la caja del QR.
 * Cuadrado: igual que siempre (lado / (módulos + 2 · silencio)).
 * Circular: la matriz se inscribe en el círculo de diámetro = lado de la caja.
 */
export function qrPlacement(
  box: { x: number; y: number; width: number },
  modules: number,
  quietZoneModules: number,
  outline: QrStyle["outline"],
): { moduleMm: number; originX: number; originY: number } {
  if (outline === "circle") {
    const quiet = Math.max(quietZoneModules, CIRCLE_QUIET_MODULES);
    const moduleMm = box.width / ((modules + 2 * quiet) * Math.SQRT2);
    const side = modules * moduleMm;
    return { moduleMm, originX: box.x + (box.width - side) / 2, originY: box.y + (box.width - side) / 2 };
  }
  const moduleMm = box.width / (modules + 2 * quietZoneModules);
  return { moduleMm, originX: box.x + quietZoneModules * moduleMm, originY: box.y + quietZoneModules * moduleMm };
}

export interface LogoPlacement {
  /** Centro y lado del cuadrado del logo, en módulos. */
  cx: number;
  cy: number;
  side: number;
  /** Zona despejada de módulos (logo + margen), en módulos. */
  hole: { x0: number; y0: number; x1: number; y1: number };
  /** Fracción del área del QR que queda despejada (0–1). */
  coverage: number;
}

export function logoPlacement(modules: number, logo: QrLogo): LogoPlacement {
  const side = (modules * logo.sizePct) / 100;
  const half = side / 2 + logo.marginModules;
  const c = modules / 2;
  const hole = { x0: c - half, y0: c - half, x1: c + half, y1: c + half };
  return { cx: c, cy: c, side, hole, coverage: Math.min(1, (2 * half) ** 2 / modules ** 2) };
}

/** Geometría del logo lista para dibujar: si hay color, todo el logo se pinta de ese color. */
export function recolorLogo(nodes: readonly ExternalNode[], color: HexColor | null): ExternalNode[] {
  if (color === null) return [...nodes];
  return nodes.map((node) =>
    node.type === "path"
      ? { ...node, fill: node.fill === "none" ? "none" : color, ...(node.stroke ? { stroke: color } : {}) }
      : { ...node, fill: color },
  );
}

export interface StyledQrPaths {
  modules: string;
  eyeFrame: string;
  eyeBall: string;
  logo: LogoPlacement | null;
}

/**
 * Trazos del QR con estilo, en las unidades de `place` (mm). Tres paths
 * compuestos —módulos, marcos y pupilas de los patrones de posición— para poder
 * darles colores distintos; ninguno usa arcos ni trazos, solo relleno.
 */
export function styleQrPaths(matrix: QrMatrix, style: QrStyle, place: Placement): StyledQrPaths {
  const n = matrix.length;
  const logo = style.logo ? logoPlacement(n, style.logo) : null;
  const body = bodyMatrix(matrix, logo?.hole ?? null);
  const origins = finderOrigins(n);
  return {
    modules: toPath(moduleCommands(body, style.modules), place),
    eyeFrame: toPath(origins.flatMap(([fx, fy]) => eyeFrameCommands(fx, fy, style.eyeFrame)), place),
    eyeBall: toPath(origins.flatMap(([fx, fy]) => eyeBallCommands(fx, fy, style.eyeBall)), place),
    logo,
  };
}
