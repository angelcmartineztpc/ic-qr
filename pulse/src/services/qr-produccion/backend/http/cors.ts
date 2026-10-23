/**
 * CORS de las Edge Functions. La autenticación es un JWT en `Authorization` (no cookies), por eso un
 * origen cruzado no abre nada que el navegador no pudiera pedir ya con el token: la lista de orígenes
 * (`QR_ALLOWED_ORIGINS`, separada por comas) es una defensa adicional, y `*` el valor por defecto.
 */
export const CORS_ALLOWED_HEADERS = "authorization, apikey, x-client-info, content-type, if-match, x-file-name, x-column-mapping, x-import-truncate, x-default-menu-url, x-request-id";
export const CORS_ALLOWED_METHODS = "GET, POST, PATCH, OPTIONS";

export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> {
  const base = {
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
    "Access-Control-Expose-Headers": "x-request-id, content-disposition, retry-after",
    "Access-Control-Max-Age": "86400",
  };
  if (allowed.length === 0 || allowed.includes("*")) return { ...base, "Access-Control-Allow-Origin": "*" };
  if (origin !== null && allowed.includes(origin)) return { ...base, "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  return { ...base, Vary: "Origin" }; // sin Allow-Origin: el navegador bloquea la respuesta
}

export const parseOrigins = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** `Content-Type` exacto (sin parámetros como `charset`). */
export function hasContentType(headers: Headers, allowed: readonly string[]): boolean {
  const mime = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return mime !== undefined && allowed.includes(mime);
}
