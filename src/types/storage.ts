/** Abstracción de almacenamiento (spec §10): S3, R2, Supabase, MinIO o disco local. */
export interface PutOptions {
  contentType: "image/svg+xml" | "application/json";
  cacheControl?: string;
  contentDisposition?: string;
  /** Solo crear si no existe (If-None-Match: *). */
  ifNoneMatch?: boolean;
  metadata?: Record<string, string>;
}

export interface StoredObjectRef {
  key: string;
  publicUrl: string;
  etag?: string;
}

export type PutResult = { status: "created"; object: StoredObjectRef } | { status: "exists"; object: StoredObjectRef };

export interface StorageCapabilities {
  conditionalPut: boolean;
  publicRead: boolean;
}

export interface StorageProvider {
  readonly id: "local" | "s3";
  readonly capabilities: StorageCapabilities;
  upload(key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult>;
  get(key: string, signal?: AbortSignal): Promise<{ body: Uint8Array; contentType?: string; etag?: string } | null>;
  head(key: string): Promise<{ metadata: Record<string, string>; etag?: string } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Pura, sin red. */
  getPublicUrl(key: string): string;
  /** Inversa de getPublicUrl (sin red: evita HTTP/SSRF para nuestro propio storage). */
  keyFromPublicUrl(url: string): string | null;
}

export type StorageErrorCode = "unavailable" | "forbidden" | "conflict" | "invalid-key" | "quota" | "unknown";
