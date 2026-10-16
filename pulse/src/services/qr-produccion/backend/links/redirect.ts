import { SHORT_CODE_PATTERN } from "@/services/qr-produccion/schemas/links";

import type { RedirectCache } from "./redirect-cache";
import type { ShortLinkRepository } from "./repository";

export type RedirectOutcome = { status: 302; location: string } | { status: 404 } | { status: 503 };

/**
 * GET /s/{código} — redirige (302) al destino vigente del link corto. Es la URL que se graba en el QR:
 * el QR no cambia aunque cambie el destino. Pública (la abren los huéspedes al escanear); solo lee.
 */
export async function resolveRedirect(rawCode: string, deps: { repo: Pick<ShortLinkRepository, "get">; cache: RedirectCache }): Promise<RedirectOutcome> {
  const code = rawCode.toLowerCase();
  if (!SHORT_CODE_PATTERN.test(code)) return { status: 404 };
  let destination = deps.cache.get(code);
  if (destination === undefined) {
    try {
      destination = (await deps.repo.get(code))?.destination ?? null;
    } catch {
      // Base de datos caída: no se guarda en caché para que el siguiente escaneo lo reintente.
      return { status: 503 };
    }
    deps.cache.set(code, destination);
  }
  return destination === null ? { status: 404 } : { status: 302, location: destination };
}

export function redirectResponse(outcome: RedirectOutcome): Response {
  switch (outcome.status) {
    case 302:
      return new Response(null, { status: 302, headers: { Location: outcome.location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    case 503:
      return new Response("Servicio no disponible", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5", "Content-Type": "text/plain; charset=utf-8" } });
    default:
      return new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
}
