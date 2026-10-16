import { QrResolveRequestSchema } from "@/services/qr-produccion/schemas/api";
import type { QrResolution } from "@/types";

import { HttpError } from "../http/errors";
import { parseBody } from "../http/validate";
import { mapWithConcurrency } from "../util/limiter";
import { resolveGenerate, type ResolveDeps } from "./resolve";
import { verifyExistingQr, type VerifyDeps } from "./verify-existing";

export interface QrResolveServices {
  resolve: ResolveDeps;
  verify: VerifyDeps;
  /** Máximo de registros por llamada. */
  maxBatch: number;
  /** Verificaciones simultáneas (rasterizar y decodificar es CPU: se acota). */
  verifyConcurrency?: number;
}

/**
 * POST qr-resolver — ÚNICO productor de QR.
 *  - `items`: registros SIN Link del QR → se genera (o reutiliza) y se guarda en el storage.
 *  - `verify`: registros CON Link del QR → se verifica ese recurso; NUNCA se genera.
 */
export async function runQrResolve(raw: unknown, services: QrResolveServices) {
  const { items, verify } = parseBody(QrResolveRequestSchema, raw, "Petición de QR no válida");
  if (items.length + verify.length > services.maxBatch) throw new HttpError(400, "VALIDATION_FAILED", `Máximo ${services.maxBatch} registros por llamada`);

  const generated = await resolveGenerate(items, services.resolve);
  const checked = await mapWithConcurrency(verify, services.verifyConcurrency ?? 4, async (item): Promise<QrResolution> => {
    const outcome = await verifyExistingQr(item.qrUrl, services.verify);
    return outcome.ok ? { recordId: item.recordId, outcome: "existing-ok", qr: outcome.qr } : { recordId: item.recordId, outcome: "failed", error: outcome.error };
  });

  const results = [...generated.results, ...checked];
  return { results, created: generated.created, reused: generated.reused, failed: results.filter((r) => r.outcome === "failed").length };
}
