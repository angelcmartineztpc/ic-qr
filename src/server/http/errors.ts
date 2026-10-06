/** Códigos de error de la API (las respuestas de error siempre son AppErrorPayload). */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN_ORIGIN"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "MISDIRECTED_HOST"
  | "RATE_LIMITED"
  | "BUSY"
  | "DRAINING"
  | "INTERNAL";

export interface AppErrorPayload {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  details?: unknown;
  recordId?: string;
}

export interface JsonErrorOptions {
  requestId: string;
  details?: unknown;
  headers?: Record<string, string>;
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  { requestId, details, headers }: JsonErrorOptions,
): Response {
  const payload: AppErrorPayload = { code, message, requestId, ...(details === undefined ? {} : { details }) };
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...headers },
  });
}

/** Error que el manejador puede lanzar para devolver una respuesta concreta. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
