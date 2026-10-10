import type { QrStyle } from "@/schemas/qr-style";
import type { HexColor, LayoutWarning } from "@/types";

import { logoPlacement, type StyleColors } from "./style-qr";

/** Luminancia relativa (WCAG) de un #RRGGBB. */
export function luminance(hex: HexColor): number {
  const channel = (offset: number) => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Relación de contraste (1–21) entre dos colores. */
export function contrastRatio(a: HexColor, b: HexColor): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Por debajo de esto un lector común deja de distinguir módulo de fondo: se bloquea la exportación. */
export const QR_BLOCK_CONTRAST = 3;
export const QR_WARN_CONTRAST = 4.5;
/** Con corrección H el QR tolera ~30 % de módulos perdidos; se avisa antes de llegar ahí. */
export const QR_WARN_LOGO_COVERAGE = 0.2;
export const QR_BLOCK_LOGO_COVERAGE = 0.3;

const PARTS = ["modules", "eyeFrame", "eyeBall"] as const;

/** Avisos de legibilidad del estilo: todo lo que puede dejar el QR sin leer en la placa. */
export function qrStyleWarnings(style: QrStyle, colors: StyleColors, modules?: number): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  for (const part of PARTS) {
    const ratio = contrastRatio(colors[part], colors.background);
    if (ratio < QR_WARN_CONTRAST) warnings.push({ code: "QR_STYLE_LOW_CONTRAST", part, ratio, level: ratio < QR_BLOCK_CONTRAST ? "block" : "warn" });
    else if (luminance(colors[part]) > luminance(colors.background)) warnings.push({ code: "QR_STYLE_INVERTED", part });
  }
  if (style.logo && modules !== undefined) {
    const { coverage } = logoPlacement(modules, style.logo);
    if (coverage > QR_WARN_LOGO_COVERAGE) {
      warnings.push({ code: "QR_STYLE_LOGO_LARGE", coverage, level: coverage > QR_BLOCK_LOGO_COVERAGE ? "block" : "warn" });
    }
  }
  return warnings;
}
