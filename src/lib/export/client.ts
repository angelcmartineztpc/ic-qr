/**
 * Cliente de `POST /api/export` (docs/ARCHITECTURE.md §S5): lee el stream de frames,
 * informa de las fases reales y devuelve los archivos como Blob. Sin DOM ni React:
 * se prueba con un `fetch` falso.
 */
import { FrameDecodeError, readFrames, type DonePayload, type FileName, type WarningPayload } from "./frames";
import type { ExportRequestInput } from "@/schemas/export";

export type ExportClientErrorCode =
  | "STREAM_TRUNCATED"
  | "NETWORK"
  | "NOT_VALID"
  | "EXPORT_TIMEOUT"
  | "RATE_LIMITED"
  | "BUSY"
  | "DRAINING"
  | "FONTS_MISSING"
  | "QR_IDENTITY_MISMATCH"
  | "QR_UNRESOLVED"
  | "SERVER";

/** Un problema del servidor que apunta a una pieza (para listarlo en el diálogo de bloqueos). */
export interface ExportDetail {
  recordId?: string;
  message: string;
}

export class ExportClientError extends Error {
  constructor(
    readonly code: ExportClientErrorCode,
    message: string,
    readonly details: ExportDetail[] = [],
    readonly recordId?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ExportClientError";
  }
}

/** La persona canceló: no es un error. */
export class ExportCancelledError extends Error {
  constructor() {
    super("Descarga cancelada");
    this.name = "ExportCancelledError";
  }
}

export type ExportPhase =
  | { phase: "generating"; done: number; total: number }
  | { phase: "preparing"; done: number; total: number }
  | { phase: "downloading"; bytes: number; size: number; file: FileName };

export interface ExportFile {
  name: string;
  mime: string;
  blob: Blob;
}

export interface ExportResult {
  files: Partial<Record<FileName, ExportFile>>;
  done: DonePayload;
  warnings: WarningPayload[];
}

export interface ExportCallbacks {
  onPhase?(phase: ExportPhase): void;
}

const KNOWN: ReadonlySet<string> = new Set(["EXPORT_TIMEOUT", "RATE_LIMITED", "BUSY", "DRAINING", "FONTS_MISSING", "QR_IDENTITY_MISMATCH", "QR_UNRESOLVED"]);

function errorFrom(payload: { code?: string; message?: string; details?: unknown; recordId?: string; requestId?: string }, status?: number): ExportClientError {
  const code: ExportClientErrorCode = payload.code === "VALIDATION_FAILED" ? "NOT_VALID" : KNOWN.has(payload.code ?? "") ? (payload.code as ExportClientErrorCode) : "SERVER";
  const raw = Array.isArray(payload.details) ? payload.details : payload.details && typeof payload.details === "object" ? [payload.details] : [];
  const details = raw.flatMap((d): ExportDetail[] => {
    const item = d as { recordId?: unknown; message?: unknown };
    return typeof item.recordId === "string" ? [{ recordId: item.recordId, message: typeof item.message === "string" ? item.message : "" }] : [];
  });
  const recordId = payload.recordId ?? details[0]?.recordId;
  return new ExportClientError(code, payload.message ?? `El servidor respondió ${status ?? "con un error"}`, details, recordId, payload.requestId);
}

/**
 * Pide la exportación y lee el stream. Lanza:
 *  - ExportCancelledError si `signal` se aborta;
 *  - ExportClientError('STREAM_TRUNCATED') si el cuerpo termina sin DONE ni ERROR;
 *  - ExportClientError('NETWORK') si no hay conexión;
 *  - ExportClientError(código del servidor) en cualquier otro fallo.
 */
export async function runExportJob(request: ExportRequestInput, callbacks: ExportCallbacks, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ExportResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), ...(signal ? { signal } : {}) });
  } catch (error) {
    if (signal?.aborted || (error as { name?: string }).name === "AbortError") throw new ExportCancelledError();
    throw new ExportClientError("NETWORK", "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
  }
  if (!response.ok || !response.body) {
    let payload: Parameters<typeof errorFrom>[0] = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      /* respuesta sin JSON (proxy, 502…) */
    }
    throw errorFrom(payload, response.status);
  }

  const parts: Partial<Record<FileName, Uint8Array[]>> = {};
  const meta: Partial<Record<FileName, { name: string; mime: string; size: number }>> = {};
  const received: Partial<Record<FileName, number>> = {};
  const warnings: WarningPayload[] = [];
  let done: DonePayload | undefined;

  try {
    for await (const frame of readFrames(response.body)) {
      switch (frame.type) {
        case 1:
          callbacks.onPhase?.(frame.payload);
          break;
        case 2:
          meta[frame.payload.fileId] = { name: frame.payload.name, mime: frame.payload.mime, size: frame.payload.size };
          parts[frame.payload.fileId] = [];
          received[frame.payload.fileId] = 0;
          callbacks.onPhase?.({ phase: "downloading", bytes: 0, size: frame.payload.size, file: frame.payload.fileId });
          break;
        case 3: {
          (parts[frame.fileId] ??= []).push(frame.data);
          const bytes = (received[frame.fileId] = (received[frame.fileId] ?? 0) + frame.data.length);
          callbacks.onPhase?.({ phase: "downloading", bytes, size: meta[frame.fileId]?.size ?? bytes, file: frame.fileId });
          break;
        }
        case 4:
          done = frame.payload;
          break;
        case 5:
          warnings.push(frame.payload);
          break;
        case 6:
          throw errorFrom(frame.payload);
      }
    }
  } catch (error) {
    if (error instanceof ExportClientError) throw error;
    if (signal?.aborted || (error as { name?: string }).name === "AbortError") throw new ExportCancelledError();
    if (error instanceof FrameDecodeError || error instanceof TypeError) throw new ExportClientError("STREAM_TRUNCATED", "La descarga se interrumpió");
    throw error;
  }
  if (signal?.aborted) throw new ExportCancelledError();
  if (!done) throw new ExportClientError("STREAM_TRUNCATED", "La descarga se interrumpió");

  const files: ExportResult["files"] = {};
  for (const id of Object.keys(meta) as FileName[]) {
    const info = meta[id];
    const chunks = parts[id] ?? [];
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (!info || total !== info.size) throw new ExportClientError("STREAM_TRUNCATED", "La descarga se interrumpió");
    files[id] = { name: info.name, mime: info.mime, blob: new Blob(chunks as BlobPart[], { type: info.mime }) };
  }
  return { files, done, warnings };
}
