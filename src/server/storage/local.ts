import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { PutOptions, PutResult, StorageCapabilities, StorageProvider } from "@/types";

import { assertValidKey, contentTypeForKey, keyFromPublicUrl, publicUrlFor, StorageError } from "./keys";

interface Sidecar {
  contentType: string;
  metadata: Record<string, string>;
  etag: string;
}

const META_SUFFIX = ".meta.json";

/**
 * Storage en disco para desarrollo y MVP de una réplica (§S3). Creación
 * atómica y «solo si no existe»: se escribe en un temporal y se enlaza
 * (`link`) al destino; si ya existe, EEXIST = «exists» y nadie sobrescribe a nadie.
 * Los metadatos van en un archivo junto al objeto, escrito ANTES que el objeto,
 * así un lector nunca ve el objeto sin sus metadatos.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly id = "local" as const;
  readonly capabilities: StorageCapabilities = { conditionalPut: true, publicRead: true };
  private readonly root: string;

  constructor(
    directory: string,
    private readonly publicBase: string,
  ) {
    this.root = resolve(directory);
  }

  private path(key: string): string {
    assertValidKey(key);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new StorageError("invalid-key", "La clave sale del directorio de storage");
    return full;
  }

  async upload(key: string, body: Uint8Array | string, options: PutOptions): Promise<PutResult> {
    const target = this.path(key);
    const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
    const sidecar: Sidecar = {
      contentType: options.contentType,
      metadata: options.metadata ?? {},
      etag: createHash("sha256").update(bytes).digest("hex"),
    };
    try {
      await mkdir(dirname(target), { recursive: true });
      const tmp = join(dirname(target), `.tmp-${randomUUID()}`);
      const tmpMeta = `${tmp}${META_SUFFIX}`;
      try {
        await writeFile(tmp, bytes, { flag: "wx" });
        await writeFile(tmpMeta, JSON.stringify(sidecar), { flag: "wx" });
        if (options.ifNoneMatch) {
          // Metadatos primero (ignorando EEXIST), luego el objeto: el que gana el enlace gana el objeto.
          await link(tmpMeta, `${target}${META_SUFFIX}`).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
          });
          try {
            await link(tmp, target);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") return { status: "exists", object: this.ref(key, await this.etagOf(target)) };
            throw error;
          }
        } else {
          await rename(tmpMeta, `${target}${META_SUFFIX}`);
          await rename(tmp, target);
        }
      } finally {
        await rm(tmp, { force: true });
        await rm(tmpMeta, { force: true });
      }
      return { status: "created", object: this.ref(key, sidecar.etag) };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError("unavailable", `No se pudo escribir ${key}`, { cause: error });
    }
  }

  async get(key: string): Promise<{ body: Uint8Array; contentType?: string; etag?: string } | null> {
    const target = this.path(key);
    try {
      const [body, meta] = await Promise.all([readFile(target), this.readSidecar(target)]);
      return { body: new Uint8Array(body), contentType: meta?.contentType ?? contentTypeForKey(key), ...(meta ? { etag: meta.etag } : {}) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new StorageError("unavailable", `No se pudo leer ${key}`, { cause: error });
    }
  }

  async head(key: string): Promise<{ metadata: Record<string, string>; etag?: string } | null> {
    const target = this.path(key);
    try {
      await stat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new StorageError("unavailable", `No se pudo consultar ${key}`, { cause: error });
    }
    const meta = await this.readSidecar(target);
    return { metadata: meta?.metadata ?? {}, ...(meta ? { etag: meta.etag } : {}) };
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    const target = this.path(key);
    await rm(target, { force: true });
    await rm(`${target}${META_SUFFIX}`, { force: true });
  }

  getPublicUrl(key: string): string {
    return publicUrlFor(key, this.publicBase);
  }

  keyFromPublicUrl(url: string): string | null {
    return keyFromPublicUrl(url, this.publicBase);
  }

  private ref(key: string, etag?: string) {
    return { key, publicUrl: this.getPublicUrl(key), ...(etag ? { etag } : {}) };
  }

  private async readSidecar(target: string): Promise<Sidecar | null> {
    try {
      return JSON.parse(await readFile(`${target}${META_SUFFIX}`, "utf8")) as Sidecar;
    } catch {
      return null;
    }
  }

  private async etagOf(target: string): Promise<string | undefined> {
    return (await this.readSidecar(target))?.etag;
  }
}
