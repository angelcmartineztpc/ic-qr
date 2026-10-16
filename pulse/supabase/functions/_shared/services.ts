import { hostPolicyFrom } from "@/services/qr-produccion/backend/qr/host-policy.ts";
import { HourlyQuota } from "@/services/qr-produccion/backend/qr/quota.ts";
import type { QrResolveServices } from "@/services/qr-produccion/backend/qr/resolve-request.ts";

import { getConfig } from "./config.ts";
import { remoteFetcher } from "./net.ts";
import { qrStorage, remainingNewQrs } from "./storage.ts";

/** Hosts de la lista blanca de «Link del QR» más nuestro propio origen de archivos (se lee del storage sin salir a la red). */
export function qrHostPolicy() {
  const { env, storagePublicBase } = getConfig();
  return hostPolicyFrom({ mode: env.QR_HOST_POLICY, allowedHosts: env.QR_ALLOWED_HOSTS, ownHost: URL.parse(storagePublicBase)?.hostname });
}

/** Raíz de composición de los servicios de QR para UNA petición (storage, descarga segura, cuota restante). */
export async function qrServices(userId: string): Promise<QrResolveServices> {
  const { env } = getConfig();
  const storage = qrStorage(userId);
  const now = () => new Date();
  return {
    resolve: { storage, keyPrefix: env.QR_KEY_PREFIX, quota: new HourlyQuota(await remainingNewQrs()), now },
    verify: { storage, keyPrefix: env.QR_KEY_PREFIX, now, fetchRemote: remoteFetcher(qrHostPolicy()) },
    maxBatch: env.QR_RESOLVE_MAX_BATCH,
    verifyConcurrency: env.QR_VERIFY_CONCURRENCY,
  };
}
