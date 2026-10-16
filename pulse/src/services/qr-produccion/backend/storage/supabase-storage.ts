/**
 * Proveedor de storage sobre Supabase Storage (bucket privado) + catálogo `qr_activos`.
 * Lógica pura: lo que toca la red entra por los puertos `ObjectBucket` y `AssetCatalog`
 * (adaptadores finos sobre supabase-js en supabase/functions/_shared/storage.ts).
 *
 *  - «Subir solo si no existe» = `upsert: false`: Storage responde 409 y se devuelve `exists`.
 *  - `head` sale del catálogo (svg_sha256 y renderer son columnas, no metadatos del objeto);
 *    si el catálogo no tiene la fila pero el archivo existe, se mide el archivo.
 *  - Cada objeto nuevo se registra en `qr_activos` (content_hash UNIQUE → storage_key).
 */
import type { PutOptions, PutResult, StorageCapabilities, StorageProvider } from "@/types";

import { sha256Hex } from "../util/sha256";
import { assertValidKey, keyFromPublicUrl, publicUrlFor, StorageError } from "./keys";

export interface BucketError {
  message: string;
  status?: number | string | undefined;
  statusCode?: number | string | undefined;
}

export interface ObjectBucket {
  upload(key: string, body: Uint8Array, options: { contentType: string; cacheControl: string; upsert: boolean }): Promise<{ error: BucketError | null }>;
  download(key: string): Promise<{ data: Blob | null; error: BucketError | null }>;
  remove(keys: string[]): Promise<{ error: BucketError | null }>;
}

export interface CatalogEntry {
  tipo: "generado" | "externo";
  content_hash: string;
  storage_key: string;
  svg_sha256: string | null;
  renderer: string | null;
  created_by: string | null;
}

export interface AssetCatalog {
  findByKey(key: string): Promise<Pick<CatalogEntry, "svg_sha256" | "renderer"> | null>;
  /** INSERT … ON CONFLICT (content_hash) DO NOTHING. */
  register(entry: CatalogEntry): Promise<void>;
}

const statusOf = (error: BucketError): number => Number(error.statusCode ?? error.status ?? 0);

const isDuplicate = (error: BucketError): boolean => statusOf(error) === 409 || /already exists|duplicate/i.test(error.message);
const isNotFound = (error: BucketError): boolean => statusOf(error) === 404 || /not found|no such object|does not exist/i.test(error.message);
const isForbidden = (error: BucketError): boolean => [401, 403].includes(statusOf(error)) || /unauthorized|forbidden|row-level security|permission/i.test(error.message);

function toStorageError(error: BucketError, action: string): StorageError {
  if (isForbidden(error)) return new StorageError("forbidden", `El almacenamiento rechazó ${action} (permisos)`, { cause: error });
  if (statusOf(error) === 413 || /exceeded the maximum allowed size|payload too large/i.test(error.message)) return new StorageError("quota", `El archivo supera el tamaño máximo del almacenamiento`, { cause: error });
  return new StorageError("unavailable", `No se pudo ${action} en el almacenamiento`, { cause: error });
}

const TYPE_OF_KEY = (key: string): CatalogEntry["tipo"] => (key.endsWith(".json") ? "externo" : "generado");
const HASH_OF_KEY = (key: string): string => /([0-9a-f]{64})\.(?:svg|json)$/.exec(key)?.[1] ?? "";

export interface SupabaseStorageOptions {
  bucket: ObjectBucket;
  catalog: AssetCatalog;
  /** Base pública de los QR (la función `qr-resolver` los sirve; el bucket es privado). */
  publicBase: string;
  /** Usuario que provoca la creación (auditoría en `qr_activos.created_by`). */
  createdBy?: string | undefined;
  warn?: (message: string, fields: Record<string, string>) => void;
}

export class SupabaseStorageProvider implements StorageProvider {
  // El contrato de `StorageProvider.id` solo conoce local|s3|r2; Supabase Storage se comporta como S3 (PUT condicional, URL derivada).
  readonly id = "s3" as const;
  readonly capabilities: StorageCapabilities = { conditionalPut: true, publicRead: true };

  constructor(private readonly options: SupabaseStorageOptions) {}

  async upload(key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult> {
    assertValidKey(key);
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const { error } = await this.options.bucket.upload(key, bytes, {
      contentType: options.contentType,
      // supabase-js espera segundos como texto; los archivos por contenido son inmutables.
      cacheControl: "31536000",
      upsert: options.ifNoneMatch !== true,
    });
    const ref = { key, publicUrl: this.getPublicUrl(key) };
    if (error) {
      if (options.ifNoneMatch && isDuplicate(error)) return { status: "exists", object: ref };
      throw toStorageError(error, "guardar el archivo");
    }
    try {
      await this.options.catalog.register({
        tipo: TYPE_OF_KEY(key),
        content_hash: HASH_OF_KEY(key),
        storage_key: key,
        svg_sha256: options.metadata?.["svg-sha256"] ?? null,
        renderer: options.metadata?.["renderer"] ?? null,
        created_by: this.options.createdBy ?? null,
      });
    } catch (catalogError) {
      // El archivo ya está: no se pierde el trabajo. `head` lo mide la próxima vez y la cuota lo cuenta en el siguiente registro.
      this.options.warn?.("No se pudo registrar el QR en qr_activos", { key, error: catalogError instanceof Error ? catalogError.message : String(catalogError) });
    }
    return { status: "created", object: ref };
  }

  async get(key: string): Promise<{ body: Uint8Array; contentType?: string } | null> {
    assertValidKey(key);
    const { data, error } = await this.options.bucket.download(key);
    if (error) {
      if (isNotFound(error)) return null;
      throw toStorageError(error, "leer el archivo");
    }
    if (!data) return null;
    return { body: new Uint8Array(await data.arrayBuffer()), ...(data.type ? { contentType: data.type } : {}) };
  }

  async head(key: string): Promise<{ metadata: Record<string, string> } | null> {
    assertValidKey(key);
    const row = await this.options.catalog.findByKey(key);
    if (row) {
      return { metadata: { ...(row.svg_sha256 ? { "svg-sha256": row.svg_sha256 } : {}), ...(row.renderer ? { renderer: row.renderer } : {}) } };
    }
    // Sin fila (el registro falló tras subir): se mide el archivo para decidir si es el mismo.
    const object = await this.get(key);
    if (!object) return null;
    return { metadata: key.endsWith(".svg") ? { "svg-sha256": sha256Hex(object.body) } : {} };
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    const { error } = await this.options.bucket.remove([key]);
    if (error && !isNotFound(error)) throw toStorageError(error, "borrar el archivo");
  }

  getPublicUrl(key: string): string {
    return publicUrlFor(key, this.options.publicBase);
  }

  keyFromPublicUrl(url: string): string | null {
    return keyFromPublicUrl(url, this.options.publicBase);
  }
}
