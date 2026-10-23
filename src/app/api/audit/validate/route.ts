import { AuditValidateRequestSchema } from "@/schemas/audit";
import { probeUrl } from "@/server/audit/probe-url";
import { HttpError, getLimits, withApiGuards } from "@/server/http";

/**
 * POST /api/audit/validate — abre cada URL de los QR del PDF y devuelve su estado.
 * El PDF se lee en el navegador; aquí solo llegan las direcciones. Una URL con problemas no detiene al resto.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const parsed = AuditValidateRequestSchema.safeParse(await ctx.readJson());
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_FAILED", "Petición de auditoría no válida", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    const urls = [...new Set(parsed.data.urls)];
    const checks = await Promise.all(urls.map(async (url) => [url, await probeUrl(url)] as const));
    return Response.json({ results: Object.fromEntries(checks) }, { headers: { "Cache-Control": "no-store" } });
  },
  () => ({ contentTypes: ["application/json"], rateLimit: getLimits().links, maxBody: 256 * 1024 }),
);
