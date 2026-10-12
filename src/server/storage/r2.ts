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

/** Obtiene el bucket del binding `QR_BUCKET` del Worker (solo existe al correr en Cloudflare o en `wrangler dev`). */
export async function cloudflareBucket(binding = "QR_BUCKET"): Promise<R2BucketLike> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const bucket = (getCloudflareContext().env as unknown as Record<string, R2BucketLike | undefined>)[binding];
  if (!bucket) throw new StorageError("unavailable", `Falta el binding R2 «${binding}» en wrangler.jsonc`);
  return bucket;
}
