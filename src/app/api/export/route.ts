import { encodeFrame } from "@/lib/export/frames";
import { ExportRequestSchema } from "@/schemas/export";
import { getEnv } from "@/server/env";
import { ExportError, prepareExport, runExport } from "@/server/export/run-export";
import { getReadyFontRegistry } from "@/server/fonts";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { log } from "@/server/log";
import { getStorage } from "@/server/storage";

const STATUS_CODE = { 400: "VALIDATION_FAILED", 408: "EXPORT_TIMEOUT", 499: "EXPORT_CANCELLED", 503: "FONTS_MISSING" } as const;

/**
 * POST /api/export — genera el PDF (y el ZIP de SVG) desde los registros reales y
 * lo devuelve como un stream de frames con progreso (docs/ARCHITECTURE.md §S5).
 * No sube nada, no genera QR y no sale a la red: solo lee el storage.
 */
export const POST = withApiGuards(
  async (ctx) => {
    const env = getEnv();
    const raw = await ctx.readJson();
    const parsed = ExportRequestSchema.safeParse(raw);
    if (!parsed.success) {
      // Cada problema de un registro lleva su id: el cliente sabe cuál pieza bloquea y por qué.
      const records = (raw as { records?: Array<{ id?: unknown }> } | null)?.records;
      const details = parsed.error.issues.slice(0, 20).map((issue) => {
        const [head, index] = issue.path;
        const id = head === "records" && typeof index === "number" ? records?.[index]?.id : undefined;
        return { path: issue.path.join("."), message: issue.message, ...(typeof id === "string" ? { recordId: id } : {}) };
      });
      throw new HttpError(400, "VALIDATION_FAILED", "La exportación no es válida: revisa las piezas con QR pendiente, desactualizado o con errores", details);
    }
    const request = parsed.data;
    if (request.records.length > env.EXPORT_MAX_RECORDS) throw new HttpError(400, "VALIDATION_FAILED", `Máximo ${env.EXPORT_MAX_RECORDS} piezas por exportación`);

    const storage = getStorage();
    const deps = { fonts: await getReadyFontRegistry(), storage, keyPrefix: env.STORAGE_KEY_PREFIX, warn: (message: string, fields: Record<string, string>) => log.warn(message, fields) };
    let prepared;
    try {
      prepared = prepareExport(request, deps);
    } catch (error) {
      if (error instanceof ExportError) {
        const code = error.code === "QR_IDENTITY_MISMATCH" ? "QR_IDENTITY_MISMATCH" : (STATUS_CODE[error.status as keyof typeof STATUS_CODE] ?? "VALIDATION_FAILED");
        throw new HttpError(error.status, code, error.message, error.recordId ? { recordId: error.recordId } : undefined);
      }
      throw error;
    }

    // El semáforo se libera cuando termina el stream, no cuando se devuelve la respuesta.
    const release = ctx.deferRelease();
    const timeout = AbortSignal.timeout(env.EXPORT_TIMEOUT_MS);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, ctx.request.signal, timeout]);
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(streamController) {
        const emit = (frame: Uint8Array) => {
          if (!closed) streamController.enqueue(frame);
        };
        try {
          await runExport(request, prepared, deps, signal, emit);
        } catch (error) {
          if (error instanceof ExportError && error.code === "EXPORT_CANCELLED") {
            log.info("Exportación cancelada por el cliente", { requestId: ctx.requestId });
          } else {
            const known = error instanceof ExportError;
            if (!known) log.error("Fallo en la exportación", { requestId: ctx.requestId, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
            emit(
              encodeFrame.error({
                code: known ? error.code : "INTERNAL",
                message: known ? error.message : `Error interno al generar el PDF. Referencia: ${ctx.requestId}`,
                requestId: ctx.requestId,
                ...(known && error.recordId ? { recordId: error.recordId } : {}),
              }),
            );
          }
        } finally {
          closed = true;
          release();
          try {
            streamController.close();
          } catch {
            /* ya cerrado por la cancelación del cliente */
          }
        }
      },
      cancel() {
        closed = true;
        controller.abort();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" },
    });
  },
  () => ({
    contentTypes: ["application/json"],
    rateLimit: getLimits().export,
    semaphore: getLimits().exportSlots,
    maxBody: getEnv().EXPORT_MAX_BODY_BYTES,
    rejectWhenDraining: true,
  }),
);
