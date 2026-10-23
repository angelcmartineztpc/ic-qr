import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import ipaddr from "ipaddr.js";

import type { AuditStatus, UrlCheck } from "@/lib/audit/models";
import { isHttpUrl } from "@/lib/audit/models";

import { defaultResolve, type ResolvedAddress } from "../net/safe-fetch";
import { isPublicAddress } from "../net/is-public-address";

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 8;
/** Servidores que no entienden HEAD: se repite con GET. */
const HEAD_UNSUPPORTED = new Set([400, 403, 405, 406, 501]);
const USER_AGENT = "Mozilla/5.0 (compatible; QRAuditor/1.0)";

export interface ProbeRequest {
  url: URL;
  /** IP ya validada: la conexión va a ella, no a lo que devuelva el DNS después (DNS rebinding). Ausente en Workers. */
  address?: ResolvedAddress;
  method: "HEAD" | "GET";
  signal: AbortSignal;
}

export interface ProbeDeps {
  /** Sin `resolve` (Workers) no se resuelve DNS aquí: `global_fetch_strictly_public` ya impide llegar a redes privadas. */
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  request(req: ProbeRequest): Promise<{ status: number; location?: string }>;
}

class Rejected extends Error {
  constructor(
    readonly status: AuditStatus,
    message: string,
  ) {
    super(message);
  }
}

const fetchRequest: ProbeDeps["request"] = async ({ url, method, signal }) => {
  const res = await fetch(url, { method, redirect: "manual", signal, headers: { "user-agent": USER_AGENT, accept: "*/*" } });
  void res.body?.cancel(); // solo interesan el estado y las cabeceras
  const location = res.headers.get("location");
  return { status: res.status, ...(location ? { location } : {}) };
};

const nodeRequest: ProbeDeps["request"] = ({ url, address, method, signal }) =>
  new Promise((resolve, reject) => {
    if (!address) return reject(new Error("Falta la dirección validada"));
    const pinned: LookupFunction = (_host, options, callback) => {
      if ((options as { all?: boolean }).all) (callback as unknown as (e: null, a: ResolvedAddress[]) => void)(null, [address]);
      else callback(null, address.address, address.family);
    };
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      { hostname: host, servername: host, port: url.port || undefined, path: `${url.pathname}${url.search}`, method, lookup: pinned, signal, headers: { "user-agent": USER_AGENT, "accept-encoding": "identity", accept: "*/*" } },
      (res) => {
        res.destroy(); // solo interesan el estado y las cabeceras, no el cuerpo
        const location = res.headers.location;
        resolve({ status: res.statusCode ?? 0, ...(location ? { location } : {}) });
      },
    );
    req.on("error", reject);
    req.end();
  });

/** Cloudflare Workers: no admite fijar la IP de la conexión, pero `fetch` solo sale a Internet público. */
const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
const defaultDeps: ProbeDeps = onWorkers ? { request: fetchRequest } : { resolve: defaultResolve, request: nodeRequest };

async function resolvePublic(url: URL, deps: ProbeDeps): Promise<ResolvedAddress | undefined> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host) && !isPublicAddress(host)) throw new Rejected("connection_error", "La dirección no es pública y no se comprueba");
  if (!deps.resolve) return undefined;
  const addresses: ResolvedAddress[] = ipaddr.isValid(host) ? [{ address: host, family: host.includes(":") ? 6 : 4 }] : await deps.resolve(host).catch(() => []);
  if (addresses.length === 0) throw new Rejected("connection_error", `No existe la dirección ${host}`);
  // Una sola IP privada basta para bloquear: esta ruta no puede usarse para sondear la red interna.
  if (!addresses.every((a) => isPublicAddress(a.address))) throw new Rejected("connection_error", "La dirección no es pública y no se comprueba");
  return addresses[0] as ResolvedAddress;
}

const hostOf = (url: string): string => (URL.parse(url)?.hostname ?? "").toLowerCase().replace(/^www\./, "");

/** Abre la URL como lo haría un teléfono: sigue redirecciones y clasifica el resultado. Nunca lanza. */
export async function probeUrl(raw: string, deps: ProbeDeps = defaultDeps): Promise<UrlCheck> {
  const start = performance.now();
  const ms = () => Math.round(performance.now() - start);
  const origin = raw.trim();
  if (!isHttpUrl(origin)) return { status: "invalid_url", detail: "El QR no contiene una URL http(s)" };

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const seen = new Set([origin]);
  let current = origin;
  let method: ProbeRequest["method"] = "HEAD";
  let hops = 0;
  try {
    for (;;) {
      const url = new URL(current);
      if (url.username || url.password) throw new Rejected("invalid_url", "La URL lleva usuario y contraseña");
      if (url.port !== "" && url.port !== "80" && url.port !== "443") throw new Rejected("invalid_url", "Solo se comprueban los puertos web estándar");
      const res = await deps.request({ url, address: await resolvePublic(url, deps), method, signal });
      if (method === "HEAD" && HEAD_UNSUPPORTED.has(res.status)) {
        method = "GET";
        continue;
      }
      if (res.status >= 300 && res.status < 400 && res.location) {
        hops++;
        const next = URL.parse(res.location, current)?.href;
        if (!next || !isHttpUrl(next) || seen.has(next) || hops > MAX_REDIRECTS) {
          return { status: "redirect_error", httpStatus: res.status, responseMs: ms(), finalUrl: next ?? current, redirects: hops, detail: next && seen.has(next) ? "Bucle de redirección" : "Demasiadas redirecciones" };
        }
        seen.add(next);
        current = next;
        continue;
      }
      if (res.status >= 400) return { status: "broken", httpStatus: res.status, responseMs: ms(), finalUrl: current, redirects: hops, detail: `HTTP ${res.status}` };
      const moved = hostOf(origin) !== hostOf(current);
      return { status: moved ? "redirect" : "ok", httpStatus: res.status, responseMs: ms(), finalUrl: current, redirects: hops, ...(moved ? { detail: `Termina en ${hostOf(current)}` } : {}) };
    }
  } catch (error) {
    if (error instanceof Rejected) return { status: error.status, responseMs: ms(), detail: error.message };
    if (signal.aborted) return { status: "timeout", responseMs: ms(), detail: `Sin respuesta en ${TIMEOUT_MS / 1000}s` };
    const e = error as { code?: string; message?: string };
    return { status: "connection_error", responseMs: ms(), detail: e.code ?? e.message ?? "Error de conexión" };
  }
}
