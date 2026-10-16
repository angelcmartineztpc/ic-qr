import { encodeFrame } from "@/services/qr-produccion/export/frames";
import { ExportRequestSchema, type ExportRequest } from "@/services/qr-produccion/schemas/export";

import { HttpError } from "../http/errors";
import { ExportError, prepareExport, runExport, type ExportDeps, type PreparedExport } from "./run-export";

const STATUS_CODE = { 400: "VALIDATION_FAILED", 408: "EXPORT_TIMEOUT", 499: "EXPORT_CANCELLED", 503: "FONTS_MISSING" } as const;

/**
 * Valida el cuerpo. Cada problema de un registro lleva su id: el cliente sabe cuál pieza bloquea y por qué.
 */
export function parseExportRequest(raw: unknown, maxRecords: number): ExportRequest {
  const parsed = ExportRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const records = (raw as { records?: Array<{ id?: unknown }> } | null)?.records;
    const details = parsed.error.issues.slice(0, 20).map((issue) => {
      const [head, index] = issue.path;
      const id = head === "records" && typeof index === "number" ? records?.[index]?.id : undefined;
      return { path: issue.path.join("."), message: issue.message, ...(typeof id === "string" ? { recordId: id } : {}) };
    });
    throw new HttpError(400, "VALIDATION_FAILED", "La exportación no es válida: revisa las piezas con QR pendiente, desactualizado o con errores", details);
  }
  if (parsed.data.records.length > maxRecords) {
    throw new HttpError(400, "VALIDATION_FAILED", `Máximo ${maxRecords} piezas por llamada de exportación. Descarga por partes (el cliente divide la exportación en lotes).`);
  }
  return parsed.data;
}

/** Comprobaciones previas (plantilla, fuentes, identidad de cada QR) con su estado HTTP real, antes de abrir el stream. */
export function prepareOrThrow(request: ExportRequest, deps: Pick<ExportDeps, "fonts" | "storage" | "keyPrefix" | "createPdfSheet">): PreparedExport {
  try {
    return prepareExport(request, deps);
  } catch (error) {
    if (error instanceof ExportError) {
      const code = error.code === "QR_IDENTITY_MISMATCH" ? "QR_IDENTITY_MISMATCH" : (STATUS_CODE[error.status as keyof typeof STATUS_CODE] ?? "VALIDATION_FAILED");
      throw new HttpError(error.status, code, error.message, error.recordId ? { recordId: error.recordId } : undefined);
    }
    throw error;
  }
}

export interface ExportStreamOptions {
  request: ExportRequest;
  prepared: PreparedExport;
  deps: ExportDeps;
  /** Cancelación del cliente (`request.signal`). */
  clientSignal?: AbortSignal;
  timeoutMs: number;
  requestId: string;
  /** Se llama una vez cuando el stream termina (libera el semáforo). */
  release: () => void;
  log: { info(message: string, fields: Record<string, string>): void; error(message: string, fields: Record<string, string>): void };
}

/**
 * Stream de frames con progreso (docs/ARCHITECTURE.md §S5). Un error durante la generación va como frame ERROR
 * (el estado HTTP ya es 200); cancelar el stream aborta el trabajo entre piezas.
 */
export function createExportStream(options: ExportStreamOptions): ReadableStream<Uint8Array> {
  const { request, prepared, deps, requestId } = options;
  const controller = new AbortController();
  const signals = [controller.signal, AbortSignal.timeout(options.timeoutMs), ...(options.clientSignal ? [options.clientSignal] : [])];
  const signal = AbortSignal.any(signals);
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(streamController) {
      const emit = (frame: Uint8Array) => {
        if (!closed) streamController.enqueue(frame);
      };
      try {
        await runExport(request, prepared, deps, signal, emit);
      } catch (error) {
        if (error instanceof ExportError && error.code === "EXPORT_CANCELLED") {
          options.log.info("Exportación cancelada por el cliente", { requestId });
        } else {
          const known = error instanceof ExportError;
          if (!known) options.log.error("Fallo en la exportación", { requestId, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
          emit(
            encodeFrame.error({
              code: known ? error.code : "INTERNAL",
              message: known ? error.message : `Error interno al generar el PDF. Referencia: ${requestId}`,
              requestId,
              ...(known && error.recordId ? { recordId: error.recordId } : {}),
            }),
          );
        }
      } finally {
        closed = true;
        options.release();
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
}
