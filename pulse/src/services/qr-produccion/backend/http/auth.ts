import { HttpError } from "./errors";

/** Roles de PULSE que pueden usar el módulo (la misma regla que `qr_tiene_acceso()` en SQL). */
export const QR_ROLES = ["Admin", "QR Producción"] as const;

/** JWT de la cabecera `Authorization: Bearer …`; 401 si falta o no tiene forma de JWT. */
export function bearerToken(headers: Headers): string {
  const match = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/.exec(headers.get("authorization")?.trim() ?? "");
  if (!match) throw new HttpError(401, "UNAUTHORIZED", "Inicia sesión para usar esta función");
  return match[1] as string;
}

/** IP del cliente para el límite de uso de las rutas públicas (`x-forwarded-for` lo pone el gateway de Supabase). */
export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
}
