import "server-only";

import { QrLogoGeometrySchema, type QrLogoGeometry } from "@/schemas/qr-style";
import { sanitizeExternalSvg, SvgRejectedError } from "@/server/qr/sanitize-svg";

export type LogoOutcome = { ok: true; geometry: QrLogoGeometry } | { ok: false; message: string };

/**
 * Convierte el SVG que sube el usuario en geometría saneada (la misma lista blanca
 * que los QR externos: solo paths y rectángulos con relleno, sin scripts ni
 * referencias). El SVG original NUNCA se guarda ni se dibuja: solo esta salida.
 */
export function sanitizeLogo(bytes: Uint8Array): LogoOutcome {
  let geometry;
  try {
    geometry = sanitizeExternalSvg(bytes);
  } catch (error) {
    if (error instanceof SvgRejectedError) return { ok: false, message: `No se pudo usar el SVG: ${error.message}. Convierte el logo a contornos (en Illustrator: Texto → Crear contornos y Objeto → Expandir) y vuelve a guardarlo como SVG.` };
    throw error;
  }
  if (geometry.strokeBased) {
    return { ok: false, message: "El logo tiene líneas hechas con trazo, que el PDF no dibuja. Conviértelas a contornos (Objeto → Trazado → Contorno de trazado) y vuelve a subirlo." };
  }
  // Solo relleno: el trazo de un elemento con relleno se descarta para que SVG y PDF muestren lo mismo.
  const nodes = geometry.nodes.map((node) => {
    if (node.type !== "path") return node;
    const { stroke: _stroke, strokeWidth: _strokeWidth, ...fillOnly } = node;
    return fillOnly;
  });
  const parsed = QrLogoGeometrySchema.safeParse({ viewBox: geometry.viewBox, nodes });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "El logo no es válido" };
  return { ok: true, geometry: parsed.data };
}
