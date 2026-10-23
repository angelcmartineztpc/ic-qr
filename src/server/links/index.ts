import "server-only";

import { getEnv } from "../env";
import { getStorage } from "../storage";
import { ObjectShortLinkRepository } from "./object-repository";
import { RedirectCache } from "./redirect-cache";
import type { LinkDeps } from "./service";
import type { ShortLinkRepository } from "./repository";

let repository: ShortLinkRepository | undefined;
const redirectCache = new RedirectCache();

/** Hoy: archivos de objeto. Fase B: `LINKS_REPOSITORY=supabase` elegirá el repositorio de Postgres. */
export function getLinkRepository(): ShortLinkRepository {
  repository ??= new ObjectShortLinkRepository(getStorage(), getEnv().STORAGE_KEY_PREFIX);
  return repository;
}

export const getRedirectCache = (): RedirectCache => redirectCache;

/**
 * Dominio sobre el que se arma el link corto: `NEXT_PUBLIC_QR_DOMAIN` (el definitivo, grabado en las piezas)
 * o, si está vacío, el origen de la aplicación que hace la petición.
 */
export function linkBase(request: Request): string {
  const configured = process.env["NEXT_PUBLIC_QR_DOMAIN"]?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const { APP_ORIGINS } = getEnv();
  const origin = request.headers.get("origin");
  return origin !== null && APP_ORIGINS.includes(origin) ? origin : (APP_ORIGINS[0] ?? new URL(request.url).origin);
}

export function getLinkDeps(request: Request): LinkDeps {
  const env = getEnv();
  const base = linkBase(request);
  const hosts = new Set<string>([...env.APP_ALLOWED_HOSTS, ...env.APP_ORIGINS.flatMap((o) => URL.parse(o)?.host ?? [])]);
  const baseHost = URL.parse(base)?.host;
  if (baseHost) hosts.add(baseHost);
  return {
    repo: getLinkRepository(),
    base,
    ownHosts: [...hosts],
    now: () => new Date().toISOString(),
    onChanged: (code) => redirectCache.delete(code),
  };
}
