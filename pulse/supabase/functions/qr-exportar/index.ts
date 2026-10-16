/**
 * qr-exportar — POST: genera el PDF vectorial (y/o el ZIP de SVG) desde los registros reales y lo devuelve como un
 * stream de frames con progreso (docs/ARCHITECTURE.md §S5). No sube nada, no genera QR y no sale a la red: solo lee el storage.
 *
 * LÍMITE: una llamada acepta como máximo `EXPORT_MAX_RECORDS` piezas (100 por defecto) por el techo de CPU de las
 * Edge Functions; el cliente divide una exportación mayor en lotes (ver supabase/README.md).
 */
import { createExportStream, parseExportRequest, prepareOrThrow } from "@/services/qr-produccion/backend/export/request.ts";
import type { ExportDeps } from "@/services/qr-produccion/backend/export/run-export.ts";

import { getConfig } from "../_shared/config.ts";
import { fontRegistryFor } from "../_shared/fonts.ts";
import { guarded, limits } from "../_shared/guards.ts";
import { log } from "../_shared/log.ts";
import { createPdfSheet } from "../_shared/pdf-writer.ts";
import { qrStorage } from "../_shared/storage.ts";

const { env } = getConfig();

Deno.serve(
  guarded(
    async (ctx) => {
      const request = parseExportRequest(await ctx.readJson(), env.EXPORT_MAX_RECORDS);
      const deps: ExportDeps = {
        fonts: await fontRegistryFor(request.templateId),
        storage: qrStorage(),
        keyPrefix: env.QR_KEY_PREFIX,
        createPdfSheet,
        warn: (message, fields) => log.warn(message, fields),
      };
      const prepared = prepareOrThrow(request, deps);

      // El semáforo se libera cuando termina el stream, no cuando se devuelve la respuesta.
      const stream = createExportStream({ request, prepared, deps, clientSignal: ctx.request.signal, timeoutMs: env.EXPORT_TIMEOUT_MS, requestId: ctx.requestId, release: ctx.deferRelease(), log });
      return new Response(stream, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    },
    { methods: ["POST"], contentTypes: ["application/json"], rateLimit: limits().export, semaphore: limits().exportSlots, maxBody: env.EXPORT_MAX_BODY_BYTES },
  ),
);
