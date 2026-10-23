import { bearerToken } from "@/services/qr-produccion/backend/http/auth.ts";
import { HttpError } from "@/services/qr-produccion/backend/http/errors.ts";

import { adminClient, userClient } from "./clients.ts";
import { log } from "./log.ts";

export interface Principal {
  userId: string;
  email: string | undefined;
}

const TTL_MS = 30_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { principal: Principal; expires: number }>();

/**
 * JWT de Supabase Auth + rol. El token se valida contra Auth (`getUser`: firma, caducidad y sesión
 * revocada) y el rol con `qr_tiene_acceso()` evaluada COMO el usuario, que es la misma función que usan las
 * políticas RLS: una sola definición de «quién puede usar el módulo». El resultado se recuerda 30 s por instancia.
 */
export async function authenticate(request: Request): Promise<Principal> {
  const token = bearerToken(request.headers);
  const hit = cache.get(token);
  if (hit && hit.expires > Date.now()) return hit.principal;

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "UNAUTHORIZED", "Tu sesión expiró o no es válida. Vuelve a iniciar sesión");

  const { data: allowed, error: roleError } = await userClient(token).rpc("qr_tiene_acceso");
  if (roleError) {
    log.error("No se pudo comprobar el rol", { userId: data.user.id, error: roleError.message });
    throw new HttpError(503, "INTERNAL", "No se pudo comprobar tu permiso. Inténtalo de nuevo en unos segundos");
  }
  if (allowed !== true) throw new HttpError(403, "FORBIDDEN", "Tu usuario no tiene permiso para usar QR Producción (se necesita el rol Admin o «QR Producción»)");

  const principal: Principal = { userId: data.user.id, email: data.user.email };
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(token, { principal, expires: Date.now() + TTL_MS });
  return principal;
}
