import { encodeMatrix } from "@/lib/qr/encode";
import { qrStyleWarnings, resolveStyleColors, type StyleColors } from "@/lib/qr-style";
import type { QrStyle } from "@/schemas/qr-style";
import { MenuUrlSchema } from "@/schemas/url";
import type { LayoutWarning, QRRecord, QrMatrix, Template } from "@/types";

/** Contenido de ejemplo para la vista previa cuando aún no hay una pieza con QR generable. */
export const SAMPLE_PAYLOAD = "https://ejemplo.com/menu";

/** Colores base del QR de la plantilla (los que se usan cuando el estilo no define uno propio). */
export function templateQrColors(qr: Pick<Template["qr"], "invert" | "foreground" | "background">) {
  return { dark: qr.invert ? qr.background : qr.foreground, light: qr.invert ? qr.foreground : qr.background };
}

/** ¿La pieza trae su propio QR (Link del QR)? Entonces ese recurso se usa tal cual: nunca se genera ni se estiliza otro. */
export const hasOwnQr = (record: Pick<QRRecord, "qr" | "qrUrl">): boolean => record.qrUrl !== undefined || record.qr.source === "existing";

/**
 * Qué se codifica en el QR de una pieza para poder estilizarlo. Un QR existente
 * (Link del QR) devuelve null: ese recurso se usa tal cual y nunca se rehace.
 */
export function stylablePayload(record: QRRecord): string | null {
  if (hasOwnQr(record)) return null;
  if (record.qr.source === "generated") return record.qr.payload;
  const menu = MenuUrlSchema.safeParse(record.menuUrl);
  return menu.success ? menu.data : null;
}

export const isStylable = (record: QRRecord): boolean => stylablePayload(record) !== null;

/** Matriz del QR de una pieza, o null si no se puede codificar. */
export function matrixOf(payload: string): QrMatrix | null {
  try {
    return encodeMatrix(payload);
  } catch {
    return null;
  }
}

/** Avisos de legibilidad del estilo con los colores y el tamaño de QR reales de la pieza que se mira. */
export function styleWarningsFor(style: QrStyle, qr: Template["qr"], modules: number | undefined): { colors: StyleColors; warnings: LayoutWarning[] } {
  const colors = resolveStyleColors(style, templateQrColors(qr));
  return { colors, warnings: qrStyleWarnings(style, colors, modules) };
}

/**
 * Para bloquear la exportación: avisos «block» del estilo en el peor caso del proyecto.
 * El contraste no depende de la pieza; el tapado del logo es mayor cuanto menos módulos tenga el QR,
 * y eso lo da el Link del menú más corto.
 */
export function blockingStyleWarnings(style: QrStyle, qr: Template["qr"], records: readonly QRRecord[]): LayoutWarning[] {
  const payloads = records.flatMap((record) => {
    const payload = stylablePayload(record);
    return payload === null ? [] : [payload];
  });
  if (payloads.length === 0) return []; // todas las piezas usan su propio QR: el estilo no se aplica
  const shortest = payloads.reduce((a, b) => (b.length < a.length ? b : a));
  const modules = style.logo ? matrixOf(shortest)?.length : undefined;
  return styleWarningsFor(style, qr, modules).warnings.filter((w) => "level" in w && w.level === "block");
}
