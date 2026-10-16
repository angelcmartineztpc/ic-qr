import type { LayoutWarning, QrErrorCode } from "@/types";

/** Errores del QR para la persona usuaria (mapa código → mensaje; preparado para i18n). */
export const QR_ERROR_MESSAGES: Record<QrErrorCode, string> = {
  unreachable: "No se pudo descargar el QR. Revisa el link e inténtalo de nuevo.",
  timeout: "El servidor del QR tardó demasiado en responder.",
  "not-an-image": "El link no es un archivo de QR (¿es un enlace de destino?). Usa el SVG del QR.",
  "too-large": "El archivo del QR es demasiado grande.",
  "unsafe-url": "El link del QR no está permitido (debe ser https y de un sitio público).",
  "host-not-allowed": "Ese sitio no está en la lista de hosts permitidos para QR existentes.",
  "unsupported-type": "Tipo de archivo no admitido; usa un SVG.",
  "raster-only": "El QR es una imagen (PNG/JPG) y no es vectorial. Sube el SVG o reemplázalo por un QR generado.",
  "invalid-svg": "El SVG del QR no es válido o contiene elementos no permitidos.",
  undecodable: "No se pudo leer el contenido del QR.",
  "storage-failed": "Error de almacenamiento: no se pudo guardar el QR.",
  "encode-failed": "No se pudo generar el QR con este Link del menú.",
  "asset-changed": "El QR existente cambió desde que se verificó.",
  "identity-mismatch": "El QR no corresponde al archivo guardado.",
  "storage-conflict": "Hay un archivo distinto en la clave de este QR; no se reutilizó ni se sobrescribió.",
  "quota-exceeded": "Se alcanzó el máximo de QR nuevos por hora. Inténtalo más tarde.",
};

export const qrErrorMessage = (code: QrErrorCode, fallback?: string): string => QR_ERROR_MESSAGES[code] ?? fallback ?? "Error de QR";

/** Avisos de composición de la pieza (texto que no cabe, módulo pequeño…). */
const QR_PART_ES = { modules: "El color de los módulos", eyeFrame: "El marco de las esquinas", eyeBall: "El centro de las esquinas" } as const;

export function describeLayoutWarning(warning: { code: string; [detail: string]: unknown }): string {
  switch (warning.code as LayoutWarning["code"]) {
    case "OVERLAP":
      return "El QR se solapa con el bloque de texto.";
    case "OUTSIDE_SAFE_MARGIN":
      return "Un elemento queda dentro del margen de seguridad de la pieza.";
    case "QR_MODULE_SMALL": {
      const mm = typeof warning.moduleMm === "number" ? `${warning.moduleMm.toFixed(2)} mm` : "muy pequeños";
      return warning.level === "block"
        ? `Los módulos del QR miden ${mm}: demasiado densos para fabricar. Acorta el Link del menú o agranda el QR.`
        : `Los módulos del QR miden ${mm}: valídalo con la hoja de calibración del taller.`;
    }
    case "QR_NO_WHITE_BACKGROUND":
      return "El QR no lleva fondo blanco.";
    case "QR_STYLE_LOW_CONTRAST": {
      const part = QR_PART_ES[warning.part as keyof typeof QR_PART_ES] ?? "El QR";
      const ratio = typeof warning.ratio === "number" ? ` (contraste ${warning.ratio.toFixed(1)}:1)` : "";
      return warning.level === "block"
        ? `${part} casi no se distingue del fondo${ratio}: ningún lector lo leerá. Oscurece el color o aclara el fondo.`
        : `${part} tiene poco contraste con el fondo${ratio}: pruébalo con un celular antes de fabricar.`;
    }
    case "QR_STYLE_INVERTED":
      return `${QR_PART_ES[warning.part as keyof typeof QR_PART_ES] ?? "El QR"} es más claro que el fondo: algunos lectores no leen QR invertidos.`;
    case "QR_STYLE_LOGO_LARGE": {
      const pct = typeof warning.coverage === "number" ? ` (${Math.round(warning.coverage * 100)} % del QR)` : "";
      return warning.level === "block"
        ? `El logo tapa demasiado del QR${pct}: supera lo que la corrección de errores puede recuperar. Redúcelo.`
        : `El logo tapa bastante del QR${pct}: confirma que se lee antes de fabricar.`;
    }
    case "TEXT_OVERFLOW":
      return `El texto «${String(warning.elementId)}» no cabe en la pieza.`;
    case "MISSING_GLYPH":
      return `La fuente no tiene el carácter «${String(warning.char)}»: no se imprimirá.`;
    default:
      return "Aviso de composición.";
  }
}
