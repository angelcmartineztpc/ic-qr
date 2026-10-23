import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { SVG_LIMITS } from "@/server/qr/sanitize-svg";
import { sanitizeLogo } from "@/server/qr-style/logo";

/**
 * POST /api/qr/logo — cuerpo = el SVG del logo. Responde la geometría saneada
 * (paths y rectángulos con relleno) que el navegador guarda en el estilo del QR.
 * No guarda nada en el storage ni genera ningún QR.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const bytes = await ctx.readBody();
    if (bytes.length === 0) throw new HttpError(400, "BAD_REQUEST", "El archivo está vacío");
    const outcome = sanitizeLogo(bytes);
    if (!outcome.ok) throw new HttpError(400, "VALIDATION_FAILED", outcome.message);
    return Response.json({ geometry: outcome.geometry }, { headers: { "Cache-Control": "no-store" } });
  },
  () => ({ contentTypes: ["image/svg+xml", "text/xml", "application/xml", "application/octet-stream", "text/plain"], rateLimit: getLimits().preview, maxBody: SVG_LIMITS.maxBytes }),
);
