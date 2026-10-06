import "server-only";

import { randomUUID } from "node:crypto";

import { getEnv } from "../env";
import { isDraining } from "../lifecycle";
import { log } from "../log";
import { createApiGuards } from "./guards";
import { perMinute, type RateLimiter } from "./rate-limit";
import { Semaphore } from "./semaphore";

const env = getEnv();

/** Guardas configuradas desde el entorno; cada route.ts exporta `withApiGuards(handler, opciones)`. */
export const withApiGuards = createApiGuards({
  auth: {
    mode: env.AUTH_MODE,
    basicUser: env.BASIC_AUTH_USER,
    basicPasswordSha256: env.BASIC_AUTH_PASSWORD_SHA256,
    proxySecret: env.PROXY_SHARED_SECRET,
  },
  origin: {
    allowedHosts: env.APP_ALLOWED_HOSTS,
    allowedOrigins: env.APP_ORIGINS,
    trustProxyHops: env.TRUST_PROXY_HOPS,
  },
  isDraining,
  logError: (message, fields) => log.error(message, fields),
  newRequestId: randomUUID,
});

/** Limitadores y semáforos compartidos por proceso (MVP de una réplica). */
export const limits: {
  resolve: RateLimiter;
  import: RateLimiter;
  export: RateLimiter;
  asset: RateLimiter;
  importSlots: Semaphore;
  exportSlots: Semaphore;
} = {
  resolve: perMinute(env.RATE_LIMIT_RESOLVE_PER_MIN),
  import: perMinute(env.RATE_LIMIT_IMPORT_PER_MIN),
  export: perMinute(env.RATE_LIMIT_EXPORT_PER_MIN),
  asset: perMinute(env.RATE_LIMIT_ASSET_PER_MIN),
  importSlots: new Semaphore(env.IMPORT_MAX_CONCURRENCY),
  exportSlots: new Semaphore(env.EXPORT_MAX_CONCURRENCY),
};

export { HttpError } from "./errors";
export { attachment } from "./content-disposition";
