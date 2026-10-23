import "server-only";

import type { PutOptions, PutResult, StorageCapabilities, StorageProvider } from "@/types";

import { assertValidKey, keyFromPublicUrl, publicUrlFor, StorageError } from "./keys";

/** Lo mínimo del bucket R2 de Cloudflare Workers que usa este adaptador (evita depender de @cloudflare/workers-types). */
export interface R2ObjectLike {
  etag: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}
export interface R2ObjectBodyLike extends R2ObjectLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface R2BucketLike {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string; contentDisposition?: string }; customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch?: string } },
  ): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
}

export interface R2Options {
  /** Resuelve el binding del bucket (en Workers viene del contexto de la petición, por eso es perezoso). */
  bucket: () => Promise<R2BucketLike>;
  publicBase: string;
}

const toStorageError = (error: unknown, key: string): StorageError => new StorageError("unavailable", `Error de almacenamiento al acceder a ${key}`, { cause: error });

/**
 * Adaptador del binding R2 de Cloudflare Workers. El bucket no es público: los archivos se sirven
 * por `GET /api/storage/**` de la propia app, que es lo que apunta `STORAGE_PUBLIC_BASE_URL`.
 * «Crear solo si no existe» usa la condición nativa de R2 (`onlyIf.etagDoesNotMatch: "*"`), así
 * que 20 subidas simultáneas de la misma clave dan 1 creada, igual que en S3.
 */
export class R2StorageProvider implements StorageProvider {
  readonly id = "r2" as const;
  readonly capabilities: StorageCapabilities = { conditionalPut: true, publicRead: true };

  constructor(private readonly options: R2Options) {}

  async upload(key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult> {
    assertValidKey(key);
    const bucket = await this.options.bucket();
    try {
      const stored = await bucket.put(key, typeof body === "string" ? new TextEncoder().encode(body) : body, {
        httpMetadata: { contentType: options.contentType, ...(options.cacheControl ? { cacheControl: options.cacheControl } : {}), ...(options.contentDisposition ? { contentDisposition: options.contentDisposition } : {}) },
        ...(options.metadata ? { customMetadata: options.metadata } : {}),
        ...(options.ifNoneMatch ? { onlyIf: { etagDoesNotMatch: "*" } } : {}),
      });
      // R2 devuelve null cuando la condición no se cumple: ya existía.
      if (stored === null) return { status: "exists", object: this.ref(key) };
      return { status: "created", object: this.ref(key, stored.etag) };
    } catch (error) {
      throw toStorageError(error, key);
    }
  }

  async get(key: string, signal?: AbortSignal): Promise<{ body: Uint8Array; contentType?: string; etag?: string } | null> {
    assertValidKey(key);
    signal?.throwIfAborted();
    const bucket = await this.options.bucket();
    try {
      const object = await bucket.get(key);
      if (!object) return null;
      const contentType = object.httpMetadata?.contentType;
      return { body: new Uint8Array(await object.arrayBuffer()), ...(contentType ? { contentType } : {}), etag: object.etag };
    } catch (error) {
      throw toStorageError(error, key);
    }
  }

  async head(key: string): Promise<{ metadata: Record<string, string>; etag?: string } | null> {
    assertValidKey(key);
    const bucket = await this.options.bucket();
    try {
      const object = await bucket.head(key);
      if (!object) return null;
      return { metadata: Object.fromEntries(Object.entries(object.customMetadata ?? {}).map(([k, v]) => [k.toLowerCase(), v])), etag: object.etag };
    } catch (error) {
      throw toStorageError(error, key);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    const bucket = await this.options.bucket();
    try {
      await bucket.delete(key);
    } catch (error) {
      throw toStorageError(error, key);
    }
  }

  getPublicUrl(key: string): string {
    return publicUrlFor(key, this.options.publicBase);
  }

  keyFromPublicUrl(url: string): string | null {
    return keyFromPublicUrl(url, this.options.publicBase);
  }

  private ref(key: string, etag?: string) {
    return { key, publicUrl: this.getPublicUrl(key), ...(etag ? { etag } : {}) };
  }
}

interface KvStoredMeta {
  etag: string;
  contentType?: string;
  customMetadata: Record<string, string>;
}

interface KVNamespaceLike {
  getWithMetadata(key: string, options: { type: "arrayBuffer" }): Promise<{ value: ArrayBuffer | null; metadata: KvStoredMeta | null }>;
  put(key: string, value: Uint8Array | ArrayBuffer, options?: { metadata?: KvStoredMeta }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
}

const memoryObjects = new Map<string, { body: Uint8Array; etag: string; contentType?: string; customMetadata: Record<string, string> }>();
const missingInKv = new Set<string>();
let memoryCounter = 0;

function createKvBackedBucket(kv: KVNamespaceLike): R2BucketLike {
  const view = (s: KvStoredMeta): R2ObjectLike => ({
    etag: s.etag,
    httpMetadata: s.contentType ? { contentType: s.contentType } : {},
    customMetadata: s.customMetadata ?? {},
  });
  return {
    async put(key, value, options) {
      if (options?.onlyIf?.etagDoesNotMatch === "*") {
        if (memoryObjects.has(key)) return null;
        if (!missingInKv.has(key)) {
          try {
            const existing = await kv.getWithMetadata(key, { type: "arrayBuffer" });
            if (existing.value !== null) {
              const existingMeta: KvStoredMeta = existing.metadata ?? { etag: "kv-etag", customMetadata: {} };
              memoryObjects.set(key, { body: new Uint8Array(existing.value), ...existingMeta });
              return null;
            }
            missingInKv.add(key);
          } catch {
            /* Si KV alcanza el límite de subrequests o cuota del plan gratuito, continuamos con la caché en memoria */
          }
        }
      }
      const meta: KvStoredMeta = {
        etag: `etag-${Date.now()}-${++memoryCounter}`,
        ...(options?.httpMetadata?.contentType ? { contentType: options.httpMetadata.contentType } : {}),
        customMetadata: { ...(options?.customMetadata ?? {}) },
      };
      const copy = new Uint8Array(value);
      memoryObjects.set(key, { body: copy, ...meta });
      missingInKv.delete(key);
      try {
        await kv.put(key, copy, { metadata: meta });
      } catch {
        /* Resiliencia en plan gratuito de KV (1000 escrituras/día o límite de subrequests por invocación) */
      }
      return view(meta);
    },
    async get(key): Promise<R2ObjectBodyLike | null> {
      const local = memoryObjects.get(key);
      if (local) {
        return {
          ...view(local),
          arrayBuffer: async () => local.body.buffer.slice(local.body.byteOffset, local.body.byteOffset + local.body.byteLength) as ArrayBuffer,
        };
      }
      if (missingInKv.has(key)) return null;
      try {
        const res = await kv.getWithMetadata(key, { type: "arrayBuffer" });
        if (!res.value) {
          missingInKv.add(key);
          return null;
        }
        const meta: KvStoredMeta = res.metadata ?? { etag: "kv-etag", customMetadata: {} };
        const body = new Uint8Array(res.value);
        memoryObjects.set(key, { body, ...meta });
        return {
          ...view(meta),
          arrayBuffer: async () => res.value as ArrayBuffer,
        };
      } catch {
        return null;
      }
    },
    async head(key) {
      const local = memoryObjects.get(key);
      if (local) return view(local);
      if (missingInKv.has(key)) return null;
      try {
        const res = await kv.getWithMetadata(key, { type: "arrayBuffer" });
        if (!res.value) {
          missingInKv.add(key);
          return null;
        }
        const meta: KvStoredMeta = res.metadata ?? { etag: "kv-etag", customMetadata: {} };
        memoryObjects.set(key, { body: new Uint8Array(res.value), ...meta });
        return view(meta);
      } catch {
        return null;
      }
    },
    async delete(key) {
      memoryObjects.delete(key);
      missingInKv.add(key);
      try {
        await kv.delete(key);
      } catch {
        /* ignorar fallo de KV */
      }
    },
    async list(options) {
      try {
        const listed = await kv.list(options?.prefix ? { prefix: options.prefix } : undefined);
        return {
          objects: listed.keys.map((k) => ({ key: k.name })),
        };
      } catch {
        return {
          objects: [...memoryObjects.keys()].filter((k) => k.startsWith(options?.prefix ?? "")).map((key) => ({ key })),
        };
      }
    },
  };
}

let memoryFallbackBucket: R2BucketLike | undefined;

function getMemoryFallbackBucket(): R2BucketLike {
  if (memoryFallbackBucket) return memoryFallbackBucket;
  const view = (s: { etag: string; contentType?: string; customMetadata: Record<string, string> }): R2ObjectLike => ({
    etag: s.etag,
    httpMetadata: s.contentType ? { contentType: s.contentType } : {},
    customMetadata: s.customMetadata,
  });
  memoryFallbackBucket = {
    async put(key, value, options) {
      if (options?.onlyIf?.etagDoesNotMatch === "*" && memoryObjects.has(key)) return null;
      const stored = {
        body: new Uint8Array(value),
        etag: `etag-${++memoryCounter}`,
        ...(options?.httpMetadata?.contentType ? { contentType: options.httpMetadata.contentType } : {}),
        customMetadata: { ...(options?.customMetadata ?? {}) },
      };
      memoryObjects.set(key, stored);
      return view(stored);
    },
    async get(key): Promise<R2ObjectBodyLike | null> {
      const s = memoryObjects.get(key);
      if (!s) return null;
      return {
        ...view(s),
        arrayBuffer: async () => s.body.buffer.slice(s.body.byteOffset, s.body.byteOffset + s.body.byteLength) as ArrayBuffer,
      };
    },
    async head(key) {
      const s = memoryObjects.get(key);
      return s ? view(s) : null;
    },
    async delete(key) {
      memoryObjects.delete(key);
    },
    async list(options) {
      return {
        objects: [...memoryObjects.keys()].filter((k) => k.startsWith(options?.prefix ?? "")).map((key) => ({ key })),
      };
    },
  };
  return memoryFallbackBucket;
}

/** Obtiene el bucket del binding `QR_BUCKET` (R2), o `QR_KV` (Cloudflare KV permanente y gratuito), o memoria en local. */
export async function cloudflareBucket(binding = "QR_BUCKET"): Promise<R2BucketLike> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const env = getCloudflareContext().env as unknown as Record<string, unknown>;
  const bucket = env[binding] as R2BucketLike | undefined;
  if (bucket) return bucket;
  const kv = env["QR_KV"] as KVNamespaceLike | undefined;
  if (kv) return createKvBackedBucket(kv);
  return getMemoryFallbackBucket();
}
