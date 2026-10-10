import type { R2BucketLike, R2ObjectBodyLike, R2ObjectLike } from "@/server/storage/r2";

interface Stored {
  body: Uint8Array;
  etag: string;
  contentType?: string;
  customMetadata: Record<string, string>;
}

/**
 * Bucket R2 en memoria con la semántica que usa el adaptador: `put` con
 * `onlyIf.etagDoesNotMatch: "*"` devuelve null si el objeto ya existe, y la comprobación
 * y la escritura son atómicas (como en R2). Los `await` entre medias simulan la red.
 */
export function createFakeR2Bucket(): R2BucketLike & { objects: Map<string, Stored>; puts: Array<{ key: string; onlyIf?: { etagDoesNotMatch?: string } | undefined }> } {
  const objects = new Map<string, Stored>();
  const puts: Array<{ key: string; onlyIf?: { etagDoesNotMatch?: string } | undefined }> = [];
  let counter = 0;
  const view = (stored: Stored): R2ObjectLike => ({ etag: stored.etag, httpMetadata: stored.contentType ? { contentType: stored.contentType } : {}, customMetadata: stored.customMetadata });
  return {
    objects,
    puts,
    async put(key, value, options) {
      await Promise.resolve();
      puts.push({ key, onlyIf: options?.onlyIf });
      if (options?.onlyIf?.etagDoesNotMatch === "*" && objects.has(key)) return null;
      const stored: Stored = { body: new Uint8Array(value), etag: `etag-${++counter}`, ...(options?.httpMetadata?.contentType ? { contentType: options.httpMetadata.contentType } : {}), customMetadata: { ...(options?.customMetadata ?? {}) } };
      objects.set(key, stored);
      return view(stored);
    },
    async get(key): Promise<R2ObjectBodyLike | null> {
      await Promise.resolve();
      const stored = objects.get(key);
      if (!stored) return null;
      return { ...view(stored), arrayBuffer: async () => stored.body.buffer.slice(stored.body.byteOffset, stored.body.byteOffset + stored.body.byteLength) as ArrayBuffer };
    },
    async head(key) {
      await Promise.resolve();
      const stored = objects.get(key);
      return stored ? view(stored) : null;
    },
    async delete(key) {
      await Promise.resolve();
      objects.delete(key);
    },
    async list(options) {
      await Promise.resolve();
      return { objects: [...objects.keys()].filter((key) => key.startsWith(options?.prefix ?? "")).map((key) => ({ key })) };
    },
  };
}
