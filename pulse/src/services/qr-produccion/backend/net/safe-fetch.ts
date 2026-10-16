
import { isIpLiteral, isPublicAddress } from "./is-public-address";

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
  /**
   * IP ya validada. El transporte de Node la fijaba en la conexión; el de Deno (Edge Functions) no puede
   * fijar la IP de `fetch`, así que la revalida y vuelve a resolver (ventana de DNS rebinding documentada en supabase/README.md).
   */
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

const hostMatches = (host: string, pattern: string): boolean => (pattern.startsWith(".") ? host.endsWith(pattern) || host === pattern.slice(1) : host === pattern);

/** Valida esquema, puerto, credenciales y política de hosts ANTES de resolver nada. */
export function assertAllowedUrl(url: URL, policy: HostPolicy): void {
  if (url.protocol !== "https:") throw new SafeFetchError("unsafe-url", "Solo se admiten URL https");
  if (url.port !== "" && url.port !== "443") throw new SafeFetchError("unsafe-url", "Solo se admite el puerto 443");
  if (url.username || url.password) throw new SafeFetchError("unsafe-url", "La URL no puede llevar credenciales");
  const host = url.hostname.toLowerCase();
  // Nombres que nunca son un destino público (se bloquean antes de preguntar al DNS).
  if (host === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) throw new SafeFetchError("unsafe-url", `${host} no es un host público`);
  if (policy.mode === "allowlist" && !policy.hosts.some((pattern) => hostMatches(host, pattern.toLowerCase()))) {
    throw new SafeFetchError("host-not-allowed", `Host no permitido: ${host}`);
  }
}

async function resolvePublic(url: URL, deps: SafeFetchDeps): Promise<ResolvedAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  if (isIpLiteral(hostname)) {
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
export async function safeFetch(rawUrl: string, options: SafeFetchOptions, deps: SafeFetchDeps): Promise<SafeFetchResult> {
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
