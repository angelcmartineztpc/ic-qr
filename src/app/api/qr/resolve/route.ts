import { QrResolveRequestSchema } from "@/schemas/api";
import { getEnv } from "@/server/env";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { getQrServices } from "@/server/qr/services";
import { resolveGenerate } from "@/server/qr/resolve";
import { verifyExistingQr } from "@/server/qr/verify-existing";
import { mapWithConcurrency } from "@/server/util/limiter";
import type { QrResolution } from "@/types";

/**
 * POST /api/qr/resolve — único productor de QR.
 *  - `items`: registros SIN Link del QR → se genera (o reutiliza) y se guarda en el storage.
 *  - `verify`: registros CON Link del QR → se verifica ese recurso; NUNCA se genera.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const parsed = QrResolveRequestSchema.safeParse(await ctx.readJson());
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_FAILED", "Petición de QR no válida", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    const { items, verify } = parsed.data;
    const max = getEnv().QR_RESOLVE_MAX_BATCH;
    if (items.length + verify.length > max) throw new HttpError(400, "VALIDATION_FAILED", `Máximo ${max} registros por llamada`);

    const services = getQrServices();
    const generated = await resolveGenerate(items, services.resolve);
    const checked = await mapWithConcurrency(verify, 4, async (item): Promise<QrResolution> => {
      const outcome = await verifyExistingQr(item.qrUrl, services.verify);
      return outcome.ok ? { recordId: item.recordId, outcome: "existing-ok", qr: outcome.qr } : { recordId: item.recordId, outcome: "failed", error: outcome.error };
    });

    const results = [...generated.results, ...checked];
    return Response.json({
      results,
      created: generated.created,
      reused: generated.reused,
      failed: results.filter((r) => r.outcome === "failed").length,
    });
  },
  () => ({ contentTypes: ["application/json"], rateLimit: getLimits().resolve, maxBody: 512 * 1024 }),
);
