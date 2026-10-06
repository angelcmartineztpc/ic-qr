import "server-only";

import { getEnv } from "../env";
import { log, hostOf } from "../log";
import { safeFetch, type HostPolicy } from "../net/safe-fetch";
import { getStorage } from "../storage";
import { HourlyQuota } from "./quota";
import type { ResolveDeps } from "./resolve";
import type { VerifyDeps } from "./verify-existing";

export interface QrServices {
  resolve: ResolveDeps;
  verify: VerifyDeps;
}

let services: QrServices | undefined;

/** Política de hosts para «Link del QR»: pública, o lista blanca (más nuestro propio storage). */
export function hostPolicyFromEnv(env: ReturnType<typeof getEnv>): HostPolicy {
  if (env.QR_HOST_POLICY === "public") return { mode: "public" };
  const own = URL.parse(env.STORAGE_PUBLIC_BASE_URL)?.hostname;
  return { mode: "allowlist", hosts: [...env.QR_ALLOWED_HOSTS, ...(own ? [own] : [])] };
}

/** Raíz de composición de los servicios de QR (storage, descarga segura, cuota). */
export function getQrServices(): QrServices {
  if (!services) {
    const env = getEnv();
    const storage = getStorage();
    const policy = hostPolicyFromEnv(env);
    const now = () => new Date();
    services = {
      resolve: { storage, keyPrefix: env.STORAGE_KEY_PREFIX, quota: new HourlyQuota(env.QR_MAX_NEW_OBJECTS_PER_HOUR), now },
      verify: {
        storage,
        keyPrefix: env.STORAGE_KEY_PREFIX,
        now,
        fetchRemote: async (url) => {
          try {
            return await safeFetch(url, { policy, timeoutMs: env.QR_FETCH_TIMEOUT_MS, maxBytes: env.QR_FETCH_MAX_BYTES });
          } catch (error) {
            // Solo el host: nunca la ruta ni la query (pueden llevar tokens).
            log.warn("No se pudo descargar un QR externo", { host: hostOf(url), code: (error as { code?: string }).code ?? "unknown" });
            throw error;
          }
        },
      },
    };
  }
  return services;
}
