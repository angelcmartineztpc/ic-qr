import type { ResolvedAddress, SafeFetchDeps } from "./safe-fetch";

/** Respuesta JSON de DNS-over-HTTPS (formato de Google/Cloudflare: `application/dns-json`). */
export interface DohResponse {
  Status?: number;
  Answer?: Array<{ type?: number; data?: string }>;
}

const TYPE_A = 1;
const TYPE_AAAA = 28;

/** Solo registros A y AAAA (los CNAME intermedios se descartan: la dirección final es la que cuenta). */
export function addressesFromDoh(response: DohResponse): ResolvedAddress[] {
  if ((response.Status ?? 0) !== 0) return [];
  return (response.Answer ?? []).flatMap((answer): ResolvedAddress[] => {
    if (typeof answer.data !== "string") return [];
    if (answer.type === TYPE_A) return [{ address: answer.data, family: 4 }];
    if (answer.type === TYPE_AAAA) return [{ address: answer.data, family: 6 }];
    return [];
  });
}

export interface ResolverOptions {
  /** `Deno.resolveDns`, si el runtime lo ofrece. */
  resolveDns?: ((hostname: string, type: "A" | "AAAA") => Promise<string[]>) | undefined;
  fetchImpl?: typeof fetch;
  dohUrl?: string;
}

const settled = async (promise: Promise<string[]>): Promise<string[] | null> => promise.catch(() => null);

/**
 * Resolutor de `safeFetch`. Primero el DNS nativo del runtime; si no existe en el runtime (las Edge Functions no
 * garantizan `Deno.resolveDns`) o no responde, DNS-over-HTTPS. Si NINGUNO resuelve, el host se trata como inalcanzable.
 */
export function makeResolver(options: ResolverOptions = {}): SafeFetchDeps["resolve"] {
  const fetchImpl = options.fetchImpl ?? fetch;
  const dohUrl = options.dohUrl ?? "https://cloudflare-dns.com/dns-query";

  const doh = async (hostname: string, type: "A" | "AAAA"): Promise<ResolvedAddress[]> => {
    const response = await fetchImpl(`${dohUrl}?name=${encodeURIComponent(hostname)}&type=${type}`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`DoH respondió ${response.status}`);
    return addressesFromDoh((await response.json()) as DohResponse);
  };

  return async (hostname) => {
    if (options.resolveDns) {
      const [a, aaaa] = await Promise.all([settled(options.resolveDns(hostname, "A")), settled(options.resolveDns(hostname, "AAAA"))]);
      if (a !== null || aaaa !== null) {
        return [...(a ?? []).map((address): ResolvedAddress => ({ address, family: 4 })), ...(aaaa ?? []).map((address): ResolvedAddress => ({ address, family: 6 }))];
      }
    }
    const [a, aaaa] = await Promise.all([doh(hostname, "A").catch(() => null), doh(hostname, "AAAA").catch(() => null)]);
    if (a === null && aaaa === null) throw new Error(`No se pudo resolver ${hostname}`);
    return [...(a ?? []), ...(aaaa ?? [])];
  };
}
