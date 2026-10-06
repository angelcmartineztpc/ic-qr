import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import type { PutOptions, PutResult, StorageCapabilities, StorageProvider } from "@/types";

import { assertValidKey, keyFromPublicUrl, publicUrlFor, StorageError } from "./keys";

export interface S3Options {
  bucket: string;
  region: string;
  endpoint?: string | undefined;
  accessKey?: string | undefined;
  secretKey?: string | undefined;
  forcePathStyle: boolean;
  /** Si el proveedor admite PUT condicional (If-None-Match: *). Supabase no. */
  conditionalPut: boolean;
  publicBase: string;
}

const statusOf = (error: unknown): number | undefined => (error instanceof S3ServiceException ? error.$metadata.httpStatusCode : (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode);

function toStorageError(error: unknown, key: string): StorageError {
  const status = statusOf(error);
  const code = status === 401 || status === 403 ? "forbidden" : status === 409 || status === 412 ? "conflict" : status === 429 || status === 503 ? "quota" : "unavailable";
  return new StorageError(code, `Error de almacenamiento al acceder a ${key}${status ? ` (HTTP ${status})` : ""}`, { cause: error });
}

/**
 * Adaptador S3-compatible: AWS S3, Cloudflare R2, Supabase Storage (S3) y MinIO.
 * Nunca envía ACL (el bucket es de lectura pública por política) y desactiva
 * el logger del SDK, que puede registrar parámetros de la petición.
 */
export class S3StorageProvider implements StorageProvider {
  readonly id = "s3" as const;
  readonly capabilities: StorageCapabilities;
  private readonly client: S3Client;

  constructor(private readonly options: S3Options) {
    this.capabilities = { conditionalPut: options.conditionalPut, publicRead: true };
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle,
      ...(options.accessKey && options.secretKey ? { credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey } } : {}),
      // Necesario para R2, Supabase y MinIO: sin sumas de comprobación obligatorias.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
  }

  async upload(key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult> {
    assertValidKey(key);
    const send = () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: typeof body === "string" ? Buffer.from(body, "utf8") : body,
          ContentType: options.contentType,
          ...(options.cacheControl ? { CacheControl: options.cacheControl } : {}),
          ...(options.contentDisposition ? { ContentDisposition: options.contentDisposition } : {}),
          ...(options.metadata ? { Metadata: options.metadata } : {}),
          ...(options.ifNoneMatch && this.options.conditionalPut ? { IfNoneMatch: "*" } : {}),
        }),
      );

    // Sin PUT condicional (Supabase hace upsert siempre): HEAD primero. Es seguro porque los bytes son idénticos.
    if (options.ifNoneMatch && !this.options.conditionalPut) {
      const existing = await this.head(key);
      if (existing) return { status: "exists", object: this.ref(key, existing.etag) };
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const result = await send();
        return { status: "created", object: this.ref(key, result.ETag) };
      } catch (error) {
        const status = statusOf(error);
        if (status === 412) return { status: "exists", object: this.ref(key) };
        if (status === 409 && attempt === 0) continue; // ConditionalRequestConflict: se reintenta una vez
        throw toStorageError(error, key);
      }
    }
  }

  async get(key: string, signal?: AbortSignal): Promise<{ body: Uint8Array; contentType?: string; etag?: string } | null> {
    assertValidKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }), signal ? { abortSignal: signal } : {});
      const body = await result.Body?.transformToByteArray();
      if (!body) return null;
      return { body, ...(result.ContentType ? { contentType: result.ContentType } : {}), ...(result.ETag ? { etag: result.ETag } : {}) };
    } catch (error) {
      if (statusOf(error) === 404 || (error as { name?: string }).name === "NoSuchKey") return null;
      throw toStorageError(error, key);
    }
  }

  async head(key: string): Promise<{ metadata: Record<string, string>; etag?: string } | null> {
    assertValidKey(key);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return { metadata: Object.fromEntries(Object.entries(result.Metadata ?? {}).map(([k, v]) => [k.toLowerCase(), v])), ...(result.ETag ? { etag: result.ETag } : {}) };
    } catch (error) {
      if (statusOf(error) === 404 || (error as { name?: string }).name === "NotFound") return null;
      throw toStorageError(error, key);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
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
