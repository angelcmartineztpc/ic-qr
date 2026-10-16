import { RecordsExcelRequestSchema } from "@/schemas/links";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { getLinkDeps } from "@/server/links";
import { buildUpdatedWorkbook } from "@/server/links/excel";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * POST /api/records/excel — el Excel actualizado del proyecto: encabezados que la importación reconoce,
 * el link corto en «Link del menú» y, de referencia, el destino de cada uno. No guarda nada.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const parsed = RecordsExcelRequestSchema.safeParse(await ctx.readJson());
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_FAILED", "Petición no válida", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    const bytes = await buildUpdatedWorkbook(parsed.data.records, getLinkDeps(ctx.request));
    return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": XLSX_MIME, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  },
  () => ({ contentTypes: ["application/json"], rateLimit: getLimits().links, maxBody: 8 * 1024 * 1024 }),
);
