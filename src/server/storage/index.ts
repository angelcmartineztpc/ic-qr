import "server-only";

import type { Env } from "../config/env-schema";
import { getEnv } from "../env";
import { AsyncLimiter } from "../util/limiter";
import { LocalStorageProvider } from "./local";
import { limitStorage } from "./limited";
import { cloudflareBucket, R2StorageProvider } from "./r2";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "@/types";

/** Construye el proveedor según el entorno (sin singleton: facilita las pruebas). */
export function createStorage(env: Env): StorageProvider {
  const provider =
    env.STORAGE_PROVIDER === "r2"
      ? new R2StorageProvider({ bucket: () => cloudflareBucket(), publicBase: env.STORAGE_PUBLIC_BASE_URL })
      : env.STORAGE_PROVIDER === "s3"
      ? new S3StorageProvider({
          bucket: env.STORAGE_BUCKET ?? "",
          region: env.STORAGE_REGION,
          endpoint: env.STORAGE_ENDPOINT,
          accessKey: env.STORAGE_ACCESS_KEY,
          secretKey: env.STORAGE_SECRET_KEY,
          forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
          // auto: Supabase hace upsert siempre (no soporta If-None-Match); el resto sí.
          conditionalPut: env.STORAGE_CONDITIONAL_PUT === "auto" ? !(env.STORAGE_ENDPOINT ?? "").includes("supabase.co") : env.STORAGE_CONDITIONAL_PUT === "true",
          publicBase: env.STORAGE_PUBLIC_BASE_URL,
        })
      : new LocalStorageProvider(env.STORAGE_LOCAL_DIR, env.STORAGE_PUBLIC_BASE_URL);
  return limitStorage(provider, new AsyncLimiter(env.STORAGE_MAX_CONCURRENCY));
}

let singleton: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  singleton ??= createStorage(getEnv());
  return singleton;
}
