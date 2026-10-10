import { comparableText } from "@/lib/text/normalize";

/**
 * Clave de URL para duplicados (§1.2-10): forma canónica WHATWG sin #fragment.
 * No se tocan path ni query (podrían ser significativos).
 */
export function urlDedupKey(url: string): string {
  const parsed = URL.parse(url.trim());
  if (!parsed) return comparableText(url);
  parsed.hash = "";
  return parsed.href;
}

export function usesPlainHttp(url: string): boolean {
  return URL.parse(url.trim())?.protocol === "http:";
}
