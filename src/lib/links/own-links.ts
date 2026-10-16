import { findPropertyByCode, isService } from "@/lib/resorts/properties";
import { SHORT_CODE_PATTERN, SHORT_LINK_PATH } from "@/schemas/links";

/** Código de un link corto propio (`…/s/{código}`), o null si el link no tiene esa forma. */
export function shortCodeOf(url: string): string | null {
  const parsed = URL.parse(url);
  if (!parsed || parsed.search !== "" || parsed.hash !== "") return null;
  if (!parsed.pathname.startsWith(SHORT_LINK_PATH)) return null;
  const code = parsed.pathname.slice(SHORT_LINK_PATH.length).toLowerCase();
  return SHORT_CODE_PATTERN.test(code) ? code : null;
}

/** Link estable por resort y servicio (`…/api/qr/{resort}/{servicio}`) que ya existe en la lista cerrada. */
export function isStableResortLink(url: string): boolean {
  const parsed = URL.parse(url);
  if (!parsed || parsed.search !== "" || parsed.hash !== "") return false;
  const match = /^\/api\/qr\/([^/]+)\/([^/]+)$/.exec(parsed.pathname);
  return match !== null && findPropertyByCode(match[1] ?? "") !== undefined && isService(match[2] ?? "");
}

/** ¿Es un link que la herramienta ya controla y que no hay que acortar? (El servidor lo comprueba otra vez.) */
export const isOwnLink = (url: string): boolean => shortCodeOf(url) !== null || isStableResortLink(url);

/** `{dominio}/s/{código}` */
export const shortUrlFor = (base: string, code: string): string => `${base.replace(/\/+$/, "")}${SHORT_LINK_PATH}${code}`;
