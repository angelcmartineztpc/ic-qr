/**
 * qr-estable — GET /{resort}/{servicio} (o /api/qr/{resort}/{servicio}): PÚBLICA. Redirige (302) al destino vigente del
 * resort, de la tabla `qr_destinos_resort`. Es la URL que se graba en el QR: el QR no cambia aunque cambie el destino.
 */
import { parseStablePath, resolveStable, stableResponse } from "@/services/qr-produccion/backend/stable-link.ts";

import { guarded, limits } from "../_shared/guards.ts";
import { dbLookup } from "../_shared/stable.ts";

Deno.serve(
  guarded(async (ctx) => stableResponse(await resolveStable(parseStablePath(ctx.url.pathname, "qr-estable"), dbLookup)), {
    auth: false,
    methods: ["GET", "HEAD"],
    rateLimit: limits().publicRead,
  }),
);
