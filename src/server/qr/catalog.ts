import "server-only";

import { qrStorageKey } from "@/lib/qr/hash-input";
import type { NewQrCatalogEntry, QrCatalog, QrCatalogEntry, StorageProvider } from "@/types";

/**
 * Catálogo de QR respaldado por el propio storage (spec §35). En el MVP la clave
 * por contenido ES el catálogo: `head(key)` responde «¿existe ya este QR?».
 * No guarda fechas (el storage no las expone aquí): createdAt/updatedAt son la
 * hora de la consulta. Con PostgreSQL esta clase se sustituye por una tabla
 * qr_codes (content_hash UNIQUE) sin tocar a quien la usa.
 */
export class StorageBackedCatalog implements QrCatalog {
  constructor(
    private readonly storage: StorageProvider,
    private readonly keyPrefix: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private entry(key: string, contentHash: string, extra: Partial<QrCatalogEntry> = {}, renderer: string | null = null): QrCatalogEntry {
    const at = this.now().toISOString();
    return {
      id: contentHash,
      source: "generated",
      payload: null,
      menuUrl: "",
      qrUrl: this.storage.getPublicUrl(key),
      contentHash,
      storageKey: key,
      rendererVersion: renderer,
      verification: null,
      createdAt: at,
      updatedAt: at,
      ...extra,
    };
  }

  async findByHash(contentHash: string): Promise<QrCatalogEntry | null> {
    const key = qrStorageKey(contentHash, this.keyPrefix);
    const head = await this.storage.head(key);
    return head ? this.entry(key, contentHash, {}, head.metadata["renderer"] ?? null) : null;
  }

  async upsertGenerated(entry: NewQrCatalogEntry): Promise<QrCatalogEntry> {
    if (!entry.contentHash || !entry.storageKey) throw new Error("Un QR generado necesita contentHash y storageKey");
    return this.entry(entry.storageKey, entry.contentHash, { ...entry });
  }

  async registerExternal(entry: NewQrCatalogEntry): Promise<QrCatalogEntry> {
    const at = this.now().toISOString();
    return { ...entry, id: entry.contentHash ?? entry.qrUrl, createdAt: at, updatedAt: at };
  }
}
