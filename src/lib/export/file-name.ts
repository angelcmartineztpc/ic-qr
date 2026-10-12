import { normalizeText } from "@/lib/text/normalize";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export const MAX_FILE_NAME_LENGTH = 120;

/**
 * Nombre de archivo seguro en Windows, macOS y Linux, sin extensión.
 * "Tropical/Mesas:2026.pdf" → "Tropical_Mesas_2026".
 */
export function sanitizeFileName(raw: string): string {
  const cleaned = normalizeText(raw)
    .replace(/\.pdf$/i, "")
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, MAX_FILE_NAME_LENGTH);
  return WINDOWS_RESERVED.test(cleaned) ? `${cleaned}_` : cleaned;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Spec §20: qr-production-YYYY-MM-DD-HHmm, en hora LOCAL, calculado al pulsar Descargar. */
export function defaultFileName(now: Date): string {
  return `qr-production-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Nombre de cada SVG del ZIP (spec §48: 001.svg, 002.svg…), numerado sobre la lista exportada. */
export function zipEntryName(index: number, total: number, label?: string): string {
  const digits = Math.max(3, String(total).length);
  const number = String(index + 1).padStart(digits, "0");
  if (!label) return `${number}.svg`;
  const slug = normalizeText(label)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `${number}-${slug}.svg` : `${number}.svg`;
}
