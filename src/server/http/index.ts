import "server-only";

import { randomUUID } from "node:crypto";

import { getEnv } from "../env";
import { isDraining } from "../lifecycle";
import { log } from "../log";
import { createApiGuards, type GuardedHandler, type RouteGuardOptions } from "./guards";
import { perMinute, type RateLimiter } from "./rate-limit";
import { Semaphore } from "./semaphore";

/**
 * Todo se crea la PRIMERA vez que llega una petición, no al importar el
 * módulo: `next build` evalúa las rutas y no debe leer ni validar el entorno.
 */
let guards: ReturnType<typeof createApiGuards> | undefined;

function getGuards() {
  if (!guards) {
    const env = getEnv();
    guards = createApiGuards({
      auth: { mode: env.AUTH_MODE, basicUser: env.BASIC_AUTH_USER, basicPasswordSha256: env.BASIC_AUTH_PASSWORD_SHA256, proxySecret: env.PROXY_SHARED_SECRET },
      origin: { allowedHosts: env.APP_ALLOWED_HOSTS, allowedOrigins: env.APP_ORIGINS, trustProxyHops: env.TRUST_PROXY_HOPS },
      isDraining,
      logError: (message, fields) => log.error(message, fields),
      newRequestId: randomUUID,
    });
  }
  return guards;
}

export interface Limits {
  resolve: RateLimiter;
  import: RateLimiter;
  export: RateLimiter;
  asset: RateLimiter;
  importSlots: Semaphore;
  exportSlots: Semaphore;
}

let limits: Limits | undefined;

/** Limitadores y semáforos compartidos por proceso (MVP de una réplica). */
export function getLimits(): Limits {
  if (!limits) {
    const env = getEnv();
    limits = {
      resolve: perMinute(env.RATE_LIMIT_RESOLVE_PER_MIN),
      import: perMinute(env.RATE_LIMIT_IMPORT_PER_MIN),
      export: perMinute(env.RATE_LIMIT_EXPORT_PER_MIN),
      asset: perMinute(env.RATE_LIMIT_ASSET_PER_MIN),
      importSlots: new Semaphore(env.IMPORT_MAX_CONCURRENCY),
      exportSlots: new Semaphore(env.EXPORT_MAX_CONCURRENCY),
    };
  }
  return limits;
}

/**
 * Cada route.ts exporta `withApiGuards(handler, () => opciones)`. Las opciones
 * se piden como función para que los limitadores se resuelvan en la primera petición.
 */
export function withApiGuards<RouteContext = unknown>(handler: GuardedHandler<RouteContext>, options: RouteGuardOptions | (() => RouteGuardOptions) = {}) {
  return (request: Request, route: RouteContext): Promise<Response> => getGuards()(handler, typeof options === "function" ? options() : options)(request, route);
}

export { HttpError } from "./errors";
export { attachment } from "./content-disposition";
