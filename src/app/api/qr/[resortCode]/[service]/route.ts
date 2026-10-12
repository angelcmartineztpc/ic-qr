import { findPropertyByCode, isService } from "@/lib/resorts/properties";

/**
 * GET /api/qr/{resortCode}/{service} — redirige (302) al destino del resort.
 * Es la URL que se graba en el QR: el QR no cambia aunque cambie el destino.
 * Pública y sin guardas: la abren los huéspedes al escanear (igual que /api/storage).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/qr/[resortCode]/[service]">) {
  const { resortCode, service } = await ctx.params;
  const property = findPropertyByCode(resortCode);
  if (!property || !isService(service)) {
    return Response.json({ error: "Resort o servicio desconocido" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, { status: 302, headers: { Location: property.serviceUrls[service], "Cache-Control": "no-store" } });
}
