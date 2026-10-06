import type { Box, QrPreset, TileSpec } from "@/types";

import { roundMm } from "./geometry";

type FixedPreset = Exclude<QrPreset, "custom">;

export const QR_PRESETS: ReadonlyArray<{ id: QrPreset; label: string }> = [
  { id: "bottom-center", label: "Abajo centrado" },
  { id: "bottom-left", label: "Abajo izquierda" },
  { id: "bottom-right", label: "Abajo derecha" },
  { id: "center", label: "Centro" },
  { id: "custom", label: "Personalizado" },
];

/** Spec §47 (fórmulas de §S4). Solo mueve el QR; conserva su tamaño actual. */
export function qrPresetBox(preset: FixedPreset, side: number, tile: TileSpec): Box {
  const { width: W, height: H, safeMarginMm: m } = tile;
  const positions: Record<FixedPreset, { x: number; y: number }> = {
    "bottom-center": { x: (W - side) / 2, y: H - m - side },
    "bottom-left": { x: m, y: H - m - side },
    "bottom-right": { x: W - m - side, y: H - m - side },
    center: { x: (W - side) / 2, y: (H - side) / 2 },
  };
  const { x, y } = positions[preset];
  return { x: roundMm(x), y: roundMm(y), width: side, height: side };
}

/** Preset cuya posición coincide (±0.05 mm); tras un arrastre manual devuelve "custom". */
export function detectPreset(box: Box, tile: TileSpec, tolerance = 0.05): QrPreset {
  for (const { id } of QR_PRESETS) {
    if (id === "custom") continue;
    const target = qrPresetBox(id, box.width, tile);
    if (Math.abs(target.x - box.x) <= tolerance && Math.abs(target.y - box.y) <= tolerance) return id;
  }
  return "custom";
}
