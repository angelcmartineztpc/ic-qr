import { createHash } from "node:crypto";

import { isValidKey, keyFromPublicUrl, publicUrlFor, StorageError } from "@/server/storage/keys";
import type { PutOptions, PutResult, StorageProvider } from "@/types";

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
}

export const PUBLIC_BASE = "https://cdn.example.com";

/**
 * Storage en memoria para las pruebas: respeta «solo si no existe», cuenta cada
 * llamada (para comprobar que NO se sube nada cuando no toca) y permite
 * simular objetos ajenos y fallos.
 */
export class MemoryStorage implements StorageProvider {
  readonly id = "s3" as const;
  readonly objects = new Map<string, StoredObject>();
  readonly calls = { upload: 0, get: 0, head: 0, exists: 0, delete: 0 };
  failNext: StorageError | null = null;
  /** Retardo artificial para provocar carreras entre llamadas concurrentes. */
  delayMs = 0;

  constructor(readonly capabilities = { conditionalPut: true, publicRead: true }) {}

  private async tick(): Promise<void> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  async upload(key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult> {
    this.calls.upload++;
    if (!isValidKey(key)) throw new StorageError("invalid-key", key);
    await this.tick();
    const ref = { key, publicUrl: this.getPublicUrl(key) };
    if (options.ifNoneMatch && this.objects.has(key)) return { status: "exists", object: ref };
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    this.objects.set(key, { body: bytes, contentType: options.contentType, metadata: options.metadata ?? {} });
    return { status: "created", object: { ...ref, etag: createHash("md5").update(bytes).digest("hex") } };
  }

  async get(key: string) {
    this.calls.get++;
    await this.tick();
    const object = this.objects.get(key);
    return object ? { body: object.body, contentType: object.contentType } : null;
  }

  async head(key: string) {
    this.calls.head++;
    await this.tick();
    const object = this.objects.get(key);
    return object ? { metadata: object.metadata } : null;
  }

  async exists(key: string) {
    this.calls.exists++;
    return this.objects.has(key);
  }

  async delete(key: string) {
    this.calls.delete++;
    this.objects.delete(key);
  }

  getPublicUrl(key: string) {
    return publicUrlFor(key, PUBLIC_BASE);
  }

  keyFromPublicUrl(url: string) {
    return keyFromPublicUrl(url, PUBLIC_BASE);
  }
}
