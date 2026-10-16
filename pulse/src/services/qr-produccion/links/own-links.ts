import { findPropertyByCode, isService } from "@/services/qr-produccion/resorts/properties";
import { SHORT_CODE_PATTERN, SHORT_LINK_PATH } from "@/services/qr-produccion/schemas/links";

/**
 * Ruta fija delante de `/s/…` y `/api/qr/…` cuando el dominio del QR es una Edge Function
 * (`https://<ref>.supabase.co/functions/v1/qr-enlaces`). Con un dominio propio en la raíz es "".
 * Sale de `VITE_QR_DOMAIN`; el servidor la pasa explícita (la deduce de su propia base).
 */
export function ownBasePath(domain: string | undefined = import.meta.env?.["VITE_QR_DOMAIN"] as string | undefined): string {
  const path = domain ? (URL.parse(domain)?.pathname ?? "") : "";
  return path.replace(/\/+$/, "");
}

/** Código de un link corto propio (`…/s/{código}`), o null si el link no tiene esa forma. */
export function shortCodeOf(url: string, basePath: string = ownBasePath()): string | null {
  const parsed = URL.parse(url);
  if (!parsed || parsed.search !== "" || parsed.hash !== "") return null;
  const prefix = `${basePath}${SHORT_LINK_PATH}`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  const code = parsed.pathname.slice(prefix.length).toLowerCase();
  return SHORT_CODE_PATTERN.test(code) ? code : null;
}

/** Link estable por resort y servicio (`…/api/qr/{resort}/{servicio}`) que ya existe en la lista cerrada. */
export function isStableResortLink(url: string, basePath: string = ownBasePath()): boolean {
  const parsed = URL.parse(url);
  if (!parsed || parsed.search !== "" || parsed.hash !== "") return false;
  if (!parsed.pathname.startsWith(`${basePath}/api/qr/`)) return false;
  const match = /^\/api\/qr\/([^/]+)\/([^/]+)$/.exec(parsed.pathname.slice(basePath.length));
  return match !== null && findPropertyByCode(match[1] ?? "") !== undefined && isService(match[2] ?? "");
}

/** ¿Es un link que la herramienta ya controla y que no hay que acortar? (El servidor lo comprueba otra vez.) */
export const isOwnLink = (url: string, basePath: string = ownBasePath()): boolean => shortCodeOf(url, basePath) !== null || isStableResortLink(url, basePath);

/** `{dominio}/s/{código}` */
export const shortUrlFor = (base: string, code: string): string => `${base.replace(/\/+$/, "")}${SHORT_LINK_PATH}${code}`;
