import { ShortLinkSchema, SHORT_LINK_HISTORY_MAX, type ShortLink } from "@/schemas/links";
import type { StorageProvider } from "@/types";

import { linkStorageKey } from "../storage/keys";
import { RevisionConflictError, type ShortLinkRepository } from "./repository";

type Storage = Pick<StorageProvider, "get" | "upload">;

/** Guarda cada link como `[prefijo/]s/v1/{código}.json` en el storage configurado (local, S3, R2 o Supabase Storage). */
export class ObjectShortLinkRepository implements ShortLinkRepository {
  constructor(
    private readonly storage: Storage,
    private readonly keyPrefix = "",
  ) {}

  async get(code: string): Promise<ShortLink | null> {
    const object = await this.storage.get(linkStorageKey(code, this.keyPrefix));
    if (!object) return null;
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(object.body));
    } catch {
      return null;
    }
    const parsed = ShortLinkSchema.safeParse(json);
    return parsed.success && parsed.data.code === code ? parsed.data : null;
  }

  async create(link: ShortLink): Promise<"created" | "exists"> {
    const result = await this.storage.upload(linkStorageKey(link.code, this.keyPrefix), JSON.stringify(link), {
      contentType: "application/json",
      cacheControl: "no-store",
      ifNoneMatch: true,
    });
    return result.status;
  }

  async updateDestination(code: string, destination: string, at: string, expectedRevision?: number): Promise<ShortLink | null> {
    const current = await this.get(code);
    if (!current) return null;
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new RevisionConflictError();
    const next: ShortLink = {
      ...current,
      destination,
      updatedAt: at,
      revision: current.revision + 1,
      history: [{ destination: current.destination, at }, ...current.history].slice(0, SHORT_LINK_HISTORY_MAX),
    };
    await this.storage.upload(linkStorageKey(code, this.keyPrefix), JSON.stringify(next), { contentType: "application/json", cacheControl: "no-store" });
    return next;
  }
}
