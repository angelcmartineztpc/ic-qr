import "server-only";

import type { PutOptions, PutResult, StorageProvider } from "@/types";

import type { AsyncLimiter } from "../util/limiter";

/** Aplica el límite global de concurrencia (STORAGE_MAX_CONCURRENCY) a todas las operaciones de red/disco. */
export function limitStorage(inner: StorageProvider, limiter: AsyncLimiter): StorageProvider {
  return {
    id: inner.id,
    capabilities: inner.capabilities,
    upload: (key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult> => limiter.run(() => inner.upload(key, body, options)),
    get: (key, signal) => limiter.run(() => inner.get(key, signal)),
    head: (key) => limiter.run(() => inner.head(key)),
    exists: (key) => limiter.run(() => inner.exists(key)),
    delete: (key) => limiter.run(() => inner.delete(key)),
    getPublicUrl: (key) => inner.getPublicUrl(key),
    keyFromPublicUrl: (url) => inner.keyFromPublicUrl(url),
  };
}
