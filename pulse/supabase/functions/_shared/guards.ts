import { createGuards, type GuardedHandler, type RouteOptions } from "@/services/qr-produccion/backend/http/guards.ts";
import { perMinute, type RateLimiter } from "@/services/qr-produccion/backend/http/rate-limit.ts";
import { Semaphore } from "@/services/qr-produccion/backend/http/semaphore.ts";

import { authenticate, type Principal } from "./auth.ts";
import { getConfig } from "./config.ts";
import { log } from "./log.ts";

/**
 * Misma cadena de guardas que `withApiGuards` de la app Next.js: preflight CORS → método → JWT + rol →
 * Content-Type → rate limit → semáforo → tamaño del cuerpo. Con un manejador por función:
 *   Deno.serve(guarded(async (ctx) => Response.json(...), { contentTypes: ["application/json"], rateLimit: limits().resolve }))
 */
let guards: ReturnType<typeof createGuards<Principal>> | undefined;

export function guarded(handler: GuardedHandler<Principal>, options?: RouteOptions): (request: Request) => Promise<Response> {
  guards ??= createGuards<Principal>({
    authenticate,
    allowedOrigins: getConfig().env.QR_ALLOWED_ORIGINS,
    logError: (message, fields) => log.error(message, fields),
    newRequestId: () => crypto.randomUUID(),
  });
  return guards(handler, options);
}

interface Limits {
  resolve: RateLimiter;
  import: RateLimiter;
  export: RateLimiter;
  preview: RateLimiter;
  links: RateLimiter;
  publicRead: RateLimiter;
  importSlots: Semaphore;
  exportSlots: Semaphore;
}

let cached: Limits | undefined;

/**
 * Límites EN MEMORIA de la instancia (isolate): Supabase puede levantar varias a la vez, así que el límite
 * efectivo es N × lo configurado. Sirve de freno contra bucles y abusos simples, no de cuota exacta
 * (ver «Riesgos abiertos» en supabase/README.md).
 */
export function limits(): Limits {
  const { env } = getConfig();
  cached ??= {
    resolve: perMinute(env.RATE_LIMIT_RESOLVE_PER_MIN),
    import: perMinute(env.RATE_LIMIT_IMPORT_PER_MIN),
    export: perMinute(env.RATE_LIMIT_EXPORT_PER_MIN),
    preview: perMinute(env.RATE_LIMIT_PREVIEW_PER_MIN),
    links: perMinute(env.RATE_LIMIT_LINKS_PER_MIN),
    publicRead: perMinute(env.RATE_LIMIT_PUBLIC_PER_MIN),
    importSlots: new Semaphore(env.IMPORT_MAX_CONCURRENCY),
    exportSlots: new Semaphore(env.EXPORT_MAX_CONCURRENCY),
  };
  return cached;
}
