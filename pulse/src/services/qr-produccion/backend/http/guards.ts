/**
 * Guardas comunes de las Edge Functions (equivalente a `withApiGuards` de la app Next.js).
 * Orden (corta en el primer fallo):
 *   0. OPTIONS (preflight CORS)        3. Content-Type exacto (415)
 *   1. Método permitido (405)          4. Rate limit (429) y semáforo sin cola (429)
 *   2. Autenticación (401/403)         5. Content-Length > límite (413) y cuerpo leído solo bajo demanda
 * Sin Deno ni Supabase: la autenticación entra por `config.authenticate`, para probarlo con `Request` y `Response`.
 */
import { clientIp } from "./auth";
import { corsHeaders, hasContentType } from "./cors";
import { HttpError, jsonError, type ApiErrorCode } from "./errors";
import type { RateLimiter } from "./rate-limit";
import { readBodyCapped, readJsonCapped } from "./read-body";
import type { Semaphore } from "./semaphore";

export interface GuardConfig<Principal> {
  /** Verifica el JWT y el rol. Lanza HttpError 401/403. */
  authenticate(request: Request): Promise<Principal>;
  allowedOrigins: readonly string[];
  logError(message: string, fields: Readonly<Record<string, string | number>>): void;
  newRequestId(): string;
}

export interface RouteOptions {
  /** Exigir sesión y rol (por defecto true). Las rutas públicas (redirect de links) ponen false. */
  auth?: boolean;
  /** Métodos admitidos (por defecto GET y POST). */
  methods?: readonly string[];
  /** Tipos MIME aceptados en peticiones con cuerpo. */
  contentTypes?: readonly string[];
  rateLimit?: RateLimiter;
  semaphore?: Semaphore;
  /** Máximo de bytes del cuerpo (por defecto 64 KiB). */
  maxBody?: number;
}

export interface GuardedContext<Principal> {
  request: Request;
  url: URL;
  requestId: string;
  /** `null` en rutas públicas. */
  principal: Principal | null;
  cors: Record<string, string>;
  readBody: () => Promise<Uint8Array>;
  readJson: () => Promise<unknown>;
  /** Para respuestas en streaming: el semáforo se libera cuando el manejador llama a la función devuelta. */
  deferRelease: () => () => void;
}

export type GuardedHandler<Principal> = (context: GuardedContext<Principal>) => Promise<Response>;

const DEFAULT_MAX_BODY = 64 * 1024;
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function createGuards<Principal>(config: GuardConfig<Principal>) {
  return function guarded(handler: GuardedHandler<Principal>, options: RouteOptions = {}): (request: Request) => Promise<Response> {
    const maxBody = options.maxBody ?? DEFAULT_MAX_BODY;
    const methods = options.methods ?? ["GET", "POST"];

    return async (request) => {
      const requestId = config.newRequestId();
      const cors = corsHeaders(request.headers.get("origin"), config.allowedOrigins);
      const fail = (status: number, code: ApiErrorCode, message: string, headers?: Record<string, string>) => jsonError(status, code, message, { requestId, headers: { ...cors, ...headers } });

      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (!methods.includes(request.method)) return fail(405, "METHOD_NOT_ALLOWED", `Método no permitido: ${request.method}`, { Allow: methods.join(", ") });

      let principal: Principal | null = null;
      if (options.auth !== false) {
        try {
          principal = await config.authenticate(request);
        } catch (error) {
          if (error instanceof HttpError) return fail(error.status, error.code, error.message);
          config.logError("Fallo al autenticar", { requestId, error: error instanceof Error ? error.message : String(error) });
          return fail(500, "INTERNAL", `Error interno. Referencia: ${requestId}`);
        }
      }

      if (BODY_METHODS.has(request.method) && options.contentTypes && !hasContentType(request.headers, options.contentTypes)) {
        return fail(415, "UNSUPPORTED_MEDIA_TYPE", `Content-Type no admitido; se espera ${options.contentTypes.join(" o ")}`);
      }

      if (options.rateLimit) {
        const key = principal !== null && typeof principal === "object" && "userId" in principal ? String((principal as { userId: unknown }).userId) : clientIp(request.headers);
        const decision = options.rateLimit.take(key);
        if (!decision.allowed) return fail(429, "RATE_LIMITED", `Demasiadas solicitudes; vuelve a intentarlo en ${decision.retryAfterSeconds} s`, { "Retry-After": String(decision.retryAfterSeconds) });
      }

      let release: (() => void) | null = null;
      if (options.semaphore) {
        release = options.semaphore.tryAcquire();
        if (!release) return fail(429, "BUSY", "El servidor está ocupado con otra operación; vuelve a intentarlo", { "Retry-After": "5" });
      }

      let deferred = false;
      try {
        const declared = request.headers.get("content-length");
        if (declared !== null && Number(declared) > maxBody) return fail(413, "PAYLOAD_TOO_LARGE", `El cuerpo supera el máximo de ${maxBody} bytes`);

        const response = await handler({
          request,
          url: new URL(request.url),
          requestId,
          principal,
          cors,
          readBody: () => readBodyCapped(request, maxBody),
          readJson: () => readJsonCapped(request, maxBody),
          deferRelease: () => {
            deferred = true;
            return release ?? (() => {});
          },
        });
        const headers = new Headers(response.headers);
        for (const [name, value] of Object.entries(cors)) headers.set(name, value);
        headers.set("X-Request-Id", requestId);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      } catch (error) {
        if (error instanceof HttpError) return jsonError(error.status, error.code, error.message, { requestId, details: error.details, headers: cors });
        config.logError("Error no controlado en la API", { requestId, route: new URL(request.url).pathname, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
        return fail(500, "INTERNAL", `Error interno. Referencia: ${requestId}`);
      } finally {
        if (!deferred) release?.();
      }
    };
  };
}
