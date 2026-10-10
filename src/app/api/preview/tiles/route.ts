import { PreviewRequestSchema } from "@/schemas/preview";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { getReadyFontRegistry } from "@/server/fonts";
import { PreviewError, renderPreviewTiles } from "@/server/preview/render-tiles";
import { getStorage } from "@/server/storage";

/**
 * POST /api/preview/tiles — piezas ya dibujadas (contornos de Address Sans Pro Cd) para la
 * vista previa. Address Sans Pro Cd es una fuente comercial que solo vive en el servidor:
 * el navegador recibe SVG, nunca la fuente.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const parsed = PreviewRequestSchema.safeParse(await ctx.readJson());
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_FAILED", "Petición de vista previa no válida", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    try {
      return Response.json(await renderPreviewTiles(parsed.data, { fonts: await getReadyFontRegistry(), storage: getStorage() }), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof PreviewError) throw new HttpError(400, "VALIDATION_FAILED", error.message);
      if (error instanceof Error && /Falta el archivo de fuente/.test(error.message)) {
        throw new HttpError(503, "FONTS_MISSING", "Faltan las fuentes de las piezas en el servidor (ejecuta `bun run fonts:setup`)");
      }
      throw error;
    }
  },
  () => ({ contentTypes: ["application/json"], rateLimit: getLimits().preview, maxBody: 1024 * 1024 }),
);
