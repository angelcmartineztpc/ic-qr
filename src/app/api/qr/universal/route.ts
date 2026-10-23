import { z } from "zod";

import { getEnv } from "@/server/env";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { sha256Hex } from "@/server/qr/hash";
import { sanitizeExternalSvg, SvgRejectedError } from "@/server/qr/sanitize-svg";
import { getStorage } from "@/server/storage";
import { qrStorageKey } from "@/lib/qr/hash-input";

const BodySchema = z.strictObject({
  svg: z.string().min(1).max(400 * 1024),
  /** Tipo de contenido (url, wifi…): solo informativo, viaja como metadato. */
  kind: z.string().regex(/^[a-z0-9-]{1,24}$/).default("custom"),
});

/**
 * POST /api/qr/universal — guarda en el mismo storage que producción el SVG que descarga el
 * generador rápido. Clave por contenido (qr/v1/{sha256}.svg): repetir no duplica y sin cuota
 * por QR, para que la migración sea solo copiar el contenedor.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const parsed = BodySchema.safeParse(await ctx.readJson());
    if (!parsed.success) throw new HttpError(400, "VALIDATION_FAILED", "Petición de QR no válida");
    const { svg, kind } = parsed.data;
    try {
      sanitizeExternalSvg(new TextEncoder().encode(svg)); // solo geometría: sin scripts ni referencias
    } catch (error) {
      if (error instanceof SvgRejectedError) throw new HttpError(400, "VALIDATION_FAILED", `El SVG no es válido: ${error.message}`);
      throw error;
    }

    const storage = getStorage();
    const svgSha256 = sha256Hex(svg);
    const key = qrStorageKey(svgSha256, getEnv().STORAGE_KEY_PREFIX);
    const put = await storage.upload(key, svg, {
      contentType: "image/svg+xml",
      cacheControl: "public, max-age=31536000, immutable",
      contentDisposition: `inline; filename="qr-${svgSha256.slice(0, 8)}.svg"`,
      ifNoneMatch: true,
      metadata: { "svg-sha256": svgSha256, origin: "quick", kind },
    });
    return Response.json({ key, url: storage.getPublicUrl(key), created: put.status === "created" });
  },
  () => ({ contentTypes: ["application/json"], rateLimit: getLimits().resolve, maxBody: 512 * 1024 }),
);
