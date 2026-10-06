import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import ipaddr from "ipaddr.js";

import { isPublicAddress } from "./is-public-address";

export type SafeFetchErrorCode = "unsafe-url" | "host-not-allowed" | "timeout" | "unreachable" | "too-large";

export class SafeFetchError extends Error {
  constructor(
    readonly code: SafeFetchErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SafeFetchError";
  }
}

export type HostPolicy = { mode: "public" } | { mode: "allowlist"; hosts: readonly string[] };

export interface SafeFetchOptions {
  policy: HostPolicy;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  bytes: Uint8Array;
  contentType: string | undefined;
  finalUrl: string;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface TransportRequest {
  url: URL;
  /** IP ya validada a la que hay que conectar (el nombre solo se usa para TLS y para Host). */
  address: ResolvedAddress;
  signal: AbortSignal;
  maxBytes: number;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Uint8Array;
}

export interface SafeFetchDeps {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
  transport(request: TransportRequest): Promise<TransportResponse>;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export const defaultResolve: SafeFetchDeps["resolve"] = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/** Conexión TLS con la IP fijada: el certificado se verifica contra el NOMBRE, no contra la IP. */
export const httpsTransport: SafeFetchDeps["transport"] = ({ url, address, signal, maxBytes }) =>
  new Promise((resolve, reject) => {
    // La IP ya validada es la que se usa; así un DNS que cambie de respuesta no sirve (DNS rebinding).
    const pinned: LookupFunction = (_hostname, options, callback) => {
      if ((options as { all?: boolean }).all) {
        (callback as unknown as (e: null, a: ResolvedAddress[]) => void)(null, [address]);
      } else {
        callback(null, address.address, address.family);
      }
    };
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        servername: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        lookup: pinned,
        signal,
        headers: { "accept-encoding": "identity", accept: "image/svg+xml,image/*;q=0.8,*/*;q=0.5", "user-agent": "QRProductionGenerator/1.0" },
      },
      (res) => {
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          reject(new SafeFetchError("too-large", `El recurso supera ${maxBytes} bytes`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            res.destroy();
            reject(new SafeFetchError("too-large", `El recurso supera ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
            body: new Uint8Array(Buffer.concat(chunks)),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });

const hostMatches = (host: string, pattern: string): boolean => (pattern.startsWith(".") ? host.endsWith(pattern) || host === pattern.slice(1) : host === pattern);

/** Valida esquema, puerto, credenciales y política de hosts ANTES de resolver nada. */
export function assertAllowedUrl(url: URL, policy: HostPolicy): void {
  if (url.protocol !== "https:") throw new SafeFetchError("unsafe-url", "Solo se admiten URL https");
  if (url.port !== "" && url.port !== "443") throw new SafeFetchError("unsafe-url", "Solo se admite el puerto 443");
  if (url.username || url.password) throw new SafeFetchError("unsafe-url", "La URL no puede llevar credenciales");
  const host = url.hostname.toLowerCase();
  if (policy.mode === "allowlist" && !policy.hosts.some((pattern) => hostMatches(host, pattern.toLowerCase()))) {
    throw new SafeFetchError("host-not-allowed", `Host no permitido: ${host}`);
  }
}

async function resolvePublic(url: URL, deps: SafeFetchDeps): Promise<ResolvedAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  if (ipaddr.isValid(hostname)) {
    addresses = [{ address: hostname, family: hostname.includes(":") ? 6 : 4 }];
  } else {
    try {
      addresses = await deps.resolve(hostname);
    } catch (error) {
      throw new SafeFetchError("unreachable", `No se pudo resolver ${hostname}`, { cause: error });
    }
  }
  if (addresses.length === 0) throw new SafeFetchError("unreachable", `${hostname} no tiene direcciones`);
  // TODAS las direcciones deben ser públicas: un solo A privado basta para bloquear.
  if (!addresses.every((a) => isPublicAddress(a.address))) {
    throw new SafeFetchError("unsafe-url", `${hostname} apunta a una dirección no pública`);
  }
  return addresses[0] as ResolvedAddress;
}

/**
 * Descarga segura de un recurso remoto (spec §31): https:443, política de
 * hosts, todas las IP públicas, IP fijada en la conexión, redirecciones
 * manuales (≤3) revalidadas, tiempo total y tamaño acotados, sin compresión.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions, deps: SafeFetchDeps = { resolve: defaultResolve, transport: httpsTransport }): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  const signal = AbortSignal.timeout(options.timeoutMs);
  const parsed = URL.parse(rawUrl);
  if (!parsed) throw new SafeFetchError("unsafe-url", "URL no válida");
  let url: URL = parsed;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    assertAllowedUrl(url, options.policy);
    const address = await resolvePublic(url, deps);
    let response: TransportResponse;
    try {
      response = await deps.transport({ url, address, signal, maxBytes: options.maxBytes });
    } catch (error) {
      if (error instanceof SafeFetchError) throw error;
      if (signal.aborted || (error as { name?: string }).name === "AbortError" || (error as { code?: string }).code === "ABORT_ERR") {
        throw new SafeFetchError("timeout", `Tiempo de espera agotado (${options.timeoutMs} ms)`, { cause: error });
      }
      throw new SafeFetchError("unreachable", `No se pudo descargar ${url.hostname}`, { cause: error });
    }

    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers["location"];
      const next: URL | null = location ? URL.parse(location, url) : null;
      if (!next) throw new SafeFetchError("unreachable", "Redirección sin destino válido");
      url = next;
      continue; // se revalida el destino completo en la siguiente vuelta
    }
    if (response.status !== 200) throw new SafeFetchError("unreachable", `El servidor respondió ${response.status}`);
    if (response.body.length > options.maxBytes) throw new SafeFetchError("too-large", `El recurso supera ${options.maxBytes} bytes`);
    return { bytes: response.body, contentType: response.headers["content-type"], finalUrl: url.href };
  }
  throw new SafeFetchError("unsafe-url", `Demasiadas redirecciones (máximo ${maxRedirects})`);
}
