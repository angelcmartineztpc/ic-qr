/**
 * Comprobaciones de Host (anti DNS-rebinding), CSRF y Content-Type (§A.5 pasos 1 y 3).
 * Next 16 solo compara Origin/Host para Server Actions; los Route Handlers lo hacen aquí.
 */

export interface OriginConfig {
  allowedHosts: readonly string[];
  allowedOrigins: readonly string[];
  /** Saltos de proxy de confianza: solo entonces se lee X-Forwarded-Host. */
  trustProxyHops: number;
}

export function requestHost(headers: Headers, trustProxyHops: number): string | null {
  if (trustProxyHops > 0) {
    const forwarded = headers.get("x-forwarded-host")?.split(",").at(-trustProxyHops)?.trim();
    if (forwarded) return forwarded.toLowerCase();
  }
  return headers.get("host")?.toLowerCase() ?? null;
}

export function isAllowedHost(headers: Headers, config: OriginConfig): boolean {
  const host = requestHost(headers, config.trustProxyHops);
  return host !== null && config.allowedHosts.some((allowed) => allowed.toLowerCase() === host);
}

/**
 * Petición del mismo origen: `Sec-Fetch-Site` same-origin/none (navegadores
 * actuales) o un `Origin` permitido. Sin ninguna de las dos cabeceras se rechaza.
 */
export function isSameOrigin(headers: Headers, config: OriginConfig): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "none") return true;
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;
  const origin = headers.get("origin");
  return origin !== null && config.allowedOrigins.includes(origin);
}

/** Compara el tipo MIME exacto (sin parámetros como `charset`). */
export function hasContentType(headers: Headers, allowed: readonly string[]): boolean {
  const mime = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return mime !== undefined && allowed.includes(mime);
}

/** IP del cliente según el salto de confianza de X-Forwarded-For (o null si no hay proxy de confianza). */
export function clientIp(headers: Headers, trustProxyHops: number): string | null {
  if (trustProxyHops <= 0) return null;
  const chain = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return chain?.at(-trustProxyHops) ?? null;
}
