import type { QrResolution } from "@/types";

/** Error de la API con el mensaje en español que el servidor ya redactó. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await delay(200 * attempt, signal);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      let payload: { code?: string; message?: string; requestId?: string } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        /* respuesta sin JSON (proxy, 502, 503…) */
      }
      const err = new ApiError(response.status, payload.code ?? "HTTP_ERROR", payload.message ?? `El servidor respondió ${response.status}`, payload.requestId);
      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts - 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
    try {
      return (await response.json()) as T;
    } catch {
      const err = new ApiError(502, "BAD_RESPONSE", "El servidor devolvió una respuesta incompleta. Inténtalo de nuevo.");
      if (attempt < maxAttempts - 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export interface ResolveRequestBody {
  items?: Array<{ recordId: string; menuUrl: string; expectedRevision: number }>;
  verify?: Array<{ recordId: string; qrUrl: string; menuUrl: string }>;
}

export interface ResolveResponse {
  results: QrResolution[];
  created: number;
  reused: number;
  failed: number;
}

export type ResolveFetcher = (body: ResolveRequestBody, signal: AbortSignal) => Promise<ResolveResponse>;

export const fetchResolve: ResolveFetcher = (body, signal) => postJson<ResolveResponse>("/api/qr/resolve", body, signal);
