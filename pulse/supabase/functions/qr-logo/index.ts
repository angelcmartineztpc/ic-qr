/**
 * qr-logo — POST con el SVG del logo como cuerpo. Responde la geometría saneada (paths y rectángulos con relleno) que el
 * navegador guarda en el estilo del QR. No guarda nada en el storage ni genera ningún QR.
 */
import { runLogo } from "@/services/qr-produccion/backend/qr/logo-request.ts";
import { SVG_LIMITS } from "@/services/qr-produccion/backend/qr/sanitize-svg.ts";

import { guarded, limits } from "../_shared/guards.ts";

Deno.serve(
  guarded(async (ctx) => Response.json(runLogo(await ctx.readBody()), { headers: { "Cache-Control": "no-store" } }), {
    methods: ["POST"],
    contentTypes: ["image/svg+xml", "text/xml", "application/xml", "application/octet-stream", "text/plain"],
    rateLimit: limits().preview,
    maxBody: SVG_LIMITS.maxBytes,
  }),
);
