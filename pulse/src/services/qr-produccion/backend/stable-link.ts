import { findPropertyByCode, isService, SERVICES } from "@/services/qr-produccion/resorts/properties";

export interface StableTarget {
  resortCode: string;
  service: string;
}

/**
 * `/{resort}/{servicio}`, `/qr/{resort}/{servicio}` o `/api/qr/{resort}/{servicio}` (con o sin el nombre de la función delante).
 * El código del resort va en mayúsculas en la URL impresa; se acepta en cualquier caso.
 */
export function parseStablePath(pathname: string, functionName: string): StableTarget | null {
  const segments = pathname.split("/").filter(Boolean);
  const at = segments.indexOf(functionName);
  let rest = at >= 0 ? segments.slice(at + 1) : segments;
  if (rest[0] === "api" && rest[1] === "qr") rest = rest.slice(2);
  else if (rest[0] === "qr") rest = rest.slice(1);
  if (rest.length !== 2) return null;
  const [resortCode, service] = rest as [string, string];
  return { resortCode: resortCode.toUpperCase(), service: service.toLowerCase() };
}

/** Destinos conocidos: la tabla `qr_destinos_resort` (que manda) o, si aún no se sembró, el catálogo del código. */
export type DestinationLookup = (resortCode: string, service: string) => Promise<string | null>;

export const catalogLookup: DestinationLookup = async (resortCode, service) => {
  const property = findPropertyByCode(resortCode);
  return property && isService(service) ? property.serviceUrls[service] : null;
};

export type StableOutcome = { status: 302; location: string } | { status: 404 } | { status: 503 };

/** El QR no cambia aunque cambie el destino: esta función solo lee la tabla y redirige. */
export async function resolveStable(target: StableTarget | null, lookup: DestinationLookup): Promise<StableOutcome> {
  if (!target || !(SERVICES as readonly string[]).includes(target.service)) return { status: 404 };
  try {
    const location = await lookup(target.resortCode, target.service);
    return location ? { status: 302, location } : { status: 404 };
  } catch {
    return { status: 503 }; // base de datos caída: no se confunde con «no existe»
  }
}

/** Respuesta HTTP de un resultado (sin caché: el destino puede cambiar en cualquier momento). */
export function stableResponse(outcome: StableOutcome): Response {
  switch (outcome.status) {
    case 302:
      return new Response(null, { status: 302, headers: { Location: outcome.location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    case 503:
      return new Response("Servicio no disponible", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5", "Content-Type": "text/plain; charset=utf-8" } });
    default:
      return Response.json({ error: "Resort o servicio desconocido" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
