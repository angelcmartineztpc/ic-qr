/**
 * Geometría pura del editor, en mm (§S4). Sin DOM: la UI convierte el puntero
 * a mm y llama a estas funciones; así todo se prueba sin navegador.
 */
import { round } from "@/lib/units";
import type { Box, TileSpec } from "@/types";

export const MIN_BOX_MM = 5;

export const roundMm = (value: number): number => round(value, 0.01);

const roundBox = (box: Box): Box => ({ x: roundMm(box.x), y: roundMm(box.y), width: roundMm(box.width), height: roundMm(box.height) });

/** Mantiene la caja dentro de la pieza (spec §46: los elementos no salen de los 50 × 50 mm). */
export function clampBox(box: Box, tile: Pick<TileSpec, "width" | "height">): Box {
  const width = Math.min(Math.max(box.width, 0), tile.width);
  const height = Math.min(Math.max(box.height, 0), tile.height);
  return roundBox({
    width,
    height,
    x: Math.min(Math.max(box.x, 0), tile.width - width),
    y: Math.min(Math.max(box.y, 0), tile.height - height),
  });
}

export function isInside(box: Box, tile: Pick<TileSpec, "width" | "height">, epsilon = 1e-6): boolean {
  return box.x >= -epsilon && box.y >= -epsilon && box.x + box.width <= tile.width + epsilon && box.y + box.height <= tile.height + epsilon;
}

export function moveBox(box: Box, dx: number, dy: number, tile: Pick<TileSpec, "width" | "height">): Box {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy }, tile);
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface ResizeOptions {
  /** El QR mantiene la proporción cuadrada (se redimensiona por las esquinas). */
  lockAspect?: boolean;
  minSize?: number;
}

/** Redimensiona desde un manejador sin salir de la pieza; el lado opuesto queda fijo. */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number, tile: Pick<TileSpec, "width" | "height">, options: ResizeOptions = {}): Box {
  const min = options.minSize ?? MIN_BOX_MM;
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;

  if (handle.includes("w")) left = Math.min(Math.max(0, left + dx), right - min);
  if (handle.includes("e")) right = Math.max(Math.min(tile.width, right + dx), left + min);
  if (handle.includes("n")) top = Math.min(Math.max(0, top + dy), bottom - min);
  if (handle.includes("s")) bottom = Math.max(Math.min(tile.height, bottom + dy), top + min);

  if (!options.lockAspect) return roundBox({ x: left, y: top, width: right - left, height: bottom - top });

  // Cuadrado anclado a la esquina (o lado) opuesto: gana el eje que más cambió.
  const anchorX = handle.includes("w") ? box.x + box.width : box.x;
  const anchorY = handle.includes("n") ? box.y + box.height : box.y;
  const width = right - left;
  const height = bottom - top;
  const horizontal = handle.includes("e") || handle.includes("w");
  const vertical = handle.includes("n") || handle.includes("s");
  let side = horizontal && vertical ? (Math.abs(width - box.width) >= Math.abs(height - box.height) ? width : height) : horizontal ? width : height;

  const maxX = handle.includes("w") ? anchorX : tile.width - anchorX;
  const maxY = handle.includes("n") ? anchorY : tile.height - anchorY;
  side = Math.max(min, Math.min(side, maxX, maxY));

  return roundBox({
    x: handle.includes("w") ? anchorX - side : anchorX,
    y: handle.includes("n") ? anchorY - side : anchorY,
    width: side,
    height: side,
  });
}

export interface SnapTargets {
  x: number[];
  y: number[];
}

/** Guías automáticas: bordes y centro de la pieza, margen de seguridad y bordes/centro de la otra caja. */
export function snapTargets(tile: TileSpec, other?: Box): SnapTargets {
  const m = tile.safeMarginMm;
  const x = [0, m, tile.width / 2, tile.width - m, tile.width];
  const y = [0, m, tile.height / 2, tile.height - m, tile.height];
  if (other) {
    x.push(other.x, other.x + other.width / 2, other.x + other.width);
    y.push(other.y, other.y + other.height / 2, other.y + other.height);
  }
  return { x, y };
}

export interface SnapResult {
  box: Box;
  guides: { x?: number; y?: number };
}

function snapAxis(start: number, size: number, targets: readonly number[], threshold: number): { delta: number; guide?: number } {
  let best: { delta: number; guide?: number } = { delta: 0 };
  let bestDistance = threshold;
  for (const edge of [start, start + size / 2, start + size]) {
    for (const target of targets) {
      const distance = Math.abs(target - edge);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { delta: target - edge, guide: target };
      }
    }
  }
  return best;
}

/** Imanta los bordes o el centro de la caja a la guía más cercana dentro del umbral. */
export function snapBox(box: Box, targets: SnapTargets, thresholdMm: number): SnapResult {
  const sx = snapAxis(box.x, box.width, targets.x, thresholdMm);
  const sy = snapAxis(box.y, box.height, targets.y, thresholdMm);
  return {
    box: roundBox({ ...box, x: box.x + sx.delta, y: box.y + sy.delta }),
    guides: { ...(sx.guide === undefined ? {} : { x: sx.guide }), ...(sy.guide === undefined ? {} : { y: sy.guide }) },
  };
}

export type NudgeDirection = "left" | "right" | "up" | "down";

/** Teclado: flechas 0.5 mm, Shift 5 mm, Alt 0.1 mm (el paso lo decide la UI). */
export function nudge(box: Box, direction: NudgeDirection, stepMm: number, tile: Pick<TileSpec, "width" | "height">): Box {
  const dx = direction === "left" ? -stepMm : direction === "right" ? stepMm : 0;
  const dy = direction === "up" ? -stepMm : direction === "down" ? stepMm : 0;
  return moveBox(box, dx, dy, tile);
}

export function boxesOverlap(a: Box, b: Box, epsilon = 1e-6): boolean {
  return a.x < b.x + b.width - epsilon && b.x < a.x + a.width - epsilon && a.y < b.y + b.height - epsilon && b.y < a.y + a.height - epsilon;
}
