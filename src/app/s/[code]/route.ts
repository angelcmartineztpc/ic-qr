import { SHORT_CODE_PATTERN } from "@/schemas/links";
import { getLinkRepository, getRedirectCache } from "@/server/links";

const NOT_FOUND = () => new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

/**
 * GET /s/{código} — redirige (302) al destino vigente del link corto.
 * Es la URL que se graba en el QR: el QR no cambia aunque cambie el destino.
 * Pública y sin guardas: la abren los huéspedes al escanear (igual que /api/qr/{resort}/{servicio}).
 * Solo lee; crear y cambiar destinos exige sesión (/api/links).
 */
export async function GET(_request: Request, ctx: RouteContext<"/s/[code]">) {
  const code = (await ctx.params).code.toLowerCase();
  if (!SHORT_CODE_PATTERN.test(code)) return NOT_FOUND();

  const cache = getRedirectCache();
  let destination = cache.get(code);
  if (destination === undefined) {
    try {
      destination = (await getLinkRepository().get(code))?.destination ?? null;
    } catch {
      // Storage caído: no se guarda en caché para que el siguiente escaneo lo reintente.
      return new Response("Servicio no disponible", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
    }
    cache.set(code, destination);
  }
  if (destination === null) return NOT_FOUND();
  return new Response(null, { status: 302, headers: { Location: destination, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
