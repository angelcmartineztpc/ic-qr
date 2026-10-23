import { ShortenRequestSchema } from "@/schemas/links";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { getLinkDeps } from "@/server/links";
import { shortenUrls } from "@/server/links/service";

/**
 * POST /api/links/shorten — acorta una lista de links del menú (máx. 200 por llamada).
 * Idempotente: el mismo link da siempre el mismo link corto. Un link inválido no detiene al resto.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const parsed = ShortenRequestSchema.safeParse(await ctx.readJson());
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_FAILED", "Petición de acortado no válida", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    try {
      const results = await shortenUrls(parsed.data.urls, getLinkDeps(ctx.request));
      return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof Error && error.name === "LinkError") throw new HttpError(503, "INTERNAL", error.message);
      throw error;
    }
  },
  () => ({ contentTypes: ["application/json"], rateLimit: getLimits().links, maxBody: 1024 * 1024 }),
);
