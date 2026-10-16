import { makeResolver } from "@/services/qr-produccion/backend/net/dns.ts";
import { makeFetchTransport } from "@/services/qr-produccion/backend/net/fetch-transport.ts";
import { safeFetch, type HostPolicy, type SafeFetchDeps } from "@/services/qr-produccion/backend/net/safe-fetch.ts";

import { getConfig } from "./config.ts";
import { hostOf, log } from "./log.ts";

/** `Deno.resolveDns` puede no existir en el runtime de las Edge Functions: `makeResolver` cae a DNS-over-HTTPS. */
const resolveDns = (hostname: string, type: "A" | "AAAA"): Promise<string[]> => {
  const resolve = (Deno as unknown as { resolveDns?: (name: string, record: string) => Promise<string[]> }).resolveDns;
  if (!resolve) return Promise.reject(new Error("Deno.resolveDns no disponible"));
  return resolve(hostname, type);
};

const deps = (): SafeFetchDeps => ({ resolve: makeResolver({ resolveDns }), transport: makeFetchTransport() });

/** Descarga segura de un recurso externo (https:443, IP públicas, redirecciones revalidadas, tiempo y tamaño acotados). */
export function remoteFetcher(policy: HostPolicy) {
  const { env } = getConfig();
  const safeDeps = deps();
  return async (url: string) => {
    try {
      return await safeFetch(url, { policy, timeoutMs: env.QR_FETCH_TIMEOUT_MS, maxBytes: env.QR_FETCH_MAX_BYTES }, safeDeps);
    } catch (error) {
      // Solo el host: nunca la ruta ni la query (pueden llevar tokens).
      log.warn("No se pudo descargar un QR externo", { host: hostOf(url), code: (error as { code?: string }).code ?? "unknown" });
      throw error;
    }
  };
}
