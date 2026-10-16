import { SupabaseStorageProvider, type AssetCatalog, type CatalogEntry, type ObjectBucket } from "@/services/qr-produccion/backend/storage/supabase-storage.ts";

import { adminClient } from "./clients.ts";
import { getConfig } from "./config.ts";
import { log } from "./log.ts";

function bucketOf(name: string): ObjectBucket {
  const bucket = adminClient().storage.from(name);
  return {
    upload: (key, body, options) => bucket.upload(key, body, { contentType: options.contentType, cacheControl: options.cacheControl, upsert: options.upsert }),
    download: (key) => bucket.download(key),
    remove: (keys) => bucket.remove(keys),
  };
}

function catalog(): AssetCatalog {
  return {
    async findByKey(key) {
      const { data, error } = await adminClient().from("qr_activos").select("svg_sha256, renderer").eq("storage_key", key).maybeSingle();
      if (error) throw new Error(error.message);
      return data as { svg_sha256: string | null; renderer: string | null } | null;
    },
    async register(entry: CatalogEntry) {
      // content_hash UNIQUE: si dos peticiones crean el mismo QR a la vez, la segunda fila se ignora.
      const { error } = await adminClient().from("qr_activos").upsert(entry, { onConflict: "content_hash", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
  };
}

/** Storage de QR (bucket privado `qr-produccion` + catálogo `qr_activos`). `createdBy` = quien provoca la creación. */
export function qrStorage(createdBy?: string): SupabaseStorageProvider {
  const { env, storagePublicBase } = getConfig();
  return new SupabaseStorageProvider({ bucket: bucketOf(env.QR_BUCKET), catalog: catalog(), publicBase: storagePublicBase, createdBy, warn: (message, fields) => log.warn(message, fields) });
}

/** Cuántos QR nuevos se pueden crear todavía en esta hora (`QR_MAX_NEW_OBJECTS_PER_HOUR` menos los creados). */
export async function remainingNewQrs(): Promise<number> {
  const { env } = getConfig();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error } = await adminClient().from("qr_activos").select("id", { count: "exact", head: true }).eq("tipo", "generado").gte("created_at", since);
  if (error) throw new Error(error.message);
  return Math.max(0, env.QR_MAX_NEW_OBJECTS_PER_HOUR - (count ?? 0));
}

export const fontsBucket = (): ObjectBucket => bucketOf(getConfig().env.QR_FONTS_BUCKET);
