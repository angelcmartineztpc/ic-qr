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

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  if (!response.ok) {
    let payload: { code?: string; message?: string; requestId?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      /* respuesta sin JSON (proxy, 502…) */
    }
    throw new ApiError(response.status, payload.code ?? "HTTP_ERROR", payload.message ?? `El servidor respondió ${response.status}`, payload.requestId);
  }
  return (await response.json()) as T;
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
