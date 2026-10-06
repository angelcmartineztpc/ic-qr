import type { Layout, LayoutWarning, Template, TileSpec } from "@/types";

import { boxesOverlap } from "./geometry";

/** Avisos del editor que no dependen del texto ni del QR concreto. */
export function layoutWarnings(layout: Layout, tile: TileSpec): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  if (boxesOverlap(layout.qr, layout.content)) warnings.push({ code: "OVERLAP", between: ["qr", "content"] });
  const m = tile.safeMarginMm;
  for (const key of ["qr", "content"] as const) {
    const box = layout[key];
    const outside = box.x < m - 1e-6 || box.y < m - 1e-6 || box.x + box.width > tile.width - m + 1e-6 || box.y + box.height > tile.height - m + 1e-6;
    if (outside) warnings.push({ code: "OUTSIDE_SAFE_MARGIN", box: key });
  }
  return warnings;
}

/** Tamaño físico de un módulo: lado del QR / (módulos + 2 · zona de silencio). */
export function qrModuleMm(qrSideMm: number, modules: number, quietZoneModules: number): number {
  return qrSideMm / (modules + 2 * quietZoneModules);
}

/** Política de densidad (§1.2-12): ≥ warn OK; entre min y warn aviso; < min bloqueo. */
export function qrModuleWarning(moduleMm: number, policy: Pick<Template["qr"], "minModuleMm" | "warnModuleMm">): LayoutWarning | null {
  if (moduleMm >= policy.warnModuleMm) return null;
  return { code: "QR_MODULE_SMALL", moduleMm, level: moduleMm < policy.minModuleMm ? "block" : "warn" };
}
