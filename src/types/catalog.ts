import type { IsoDateTime } from "./common";

/** Catálogo de QR (spec §35). MVP: respaldado por el storage; futuro: tabla PostgreSQL. */
export interface QrCatalogEntry {
  id: string;
  source: "generated" | "external";
  payload: string | null;
  menuUrl: string;
  qrUrl: string;
  /** UNIQUE para generated. */
  contentHash: string | null;
  storageKey: string | null;
  rendererVersion: string | null;
  verification: "decoded" | "undecodable" | "unchecked" | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type NewQrCatalogEntry = Omit<QrCatalogEntry, "id" | "createdAt" | "updatedAt">;

export interface QrCatalog {
  findByHash(contentHash: string): Promise<QrCatalogEntry | null>;
  upsertGenerated(entry: NewQrCatalogEntry): Promise<QrCatalogEntry>;
  registerExternal(entry: NewQrCatalogEntry): Promise<QrCatalogEntry>;
}
