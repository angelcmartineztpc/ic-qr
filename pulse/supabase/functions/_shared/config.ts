import { derivedUrls, parseQrEnv, type QrEnv } from "@/services/qr-produccion/backend/config/env-schema.ts";

export interface QrConfig {
  env: QrEnv;
  functionsBase: string;
  linksFallbackBase: string;
  storagePublicBase: string;
}

let cached: QrConfig | undefined;

/** Se valida una vez por instancia; si falta algo, la primera petición falla con TODOS los problemas en el log. */
export function getConfig(): QrConfig {
  if (!cached) {
    const env = parseQrEnv(Deno.env.toObject());
    cached = { env, ...derivedUrls(env) };
  }
  return cached;
}
