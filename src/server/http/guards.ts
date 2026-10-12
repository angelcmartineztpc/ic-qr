/**
 * Guardas comunes de todos los Route Handlers (docs/ARCHITECTURE.md §A.5).
 *
 * Orden (corta en el primer fallo):
 *   1. Host permitido (421)            4. Rate limit (429)
 *   2. Autenticación (401)             5. Semáforo sin cola (429)
 *   3. Content-Type exacto (415) y     6. Content-Length > límite (413)
 *      mismo origen / CSRF (403)       7. Cuerpo leído solo bajo demanda, con límite
 * Con la app en apagado ordenado, las rutas marcadas rechazan con 503.
 */
import { authenticate, BASIC_REALM, type AuthConfig } from "./auth";
import { HttpError, jsonError } from "./errors";
import { clientIp, hasContentType, isAllowedHost, isSameOrigin, type OriginConfig } from "./origin";
import type { RateLimiter } from "./rate-limit";
import { readBodyCapped, readJsonCapped } from "./read-body";
import type { Semaphore } from "./semaphore";

export interface GuardConfig {
  auth: AuthConfig;
  origin: OriginConfig;
  isDraining: () => boolean;
  logError: (message: string, fields: Readonly<Record<string, string | number>>) => void;
  newRequestId: () => string;
}

export interface RouteGuardOptions {
  /** Exigir autenticación (por defecto true). */
  auth?: boolean;
  /** Exigir mismo origen; por defecto true salvo en GET/HEAD. */
  csrf?: boolean;
  /** Tipos MIME aceptados en peticiones con cuerpo. */
  contentTypes?: readonly string[];
  rateLimit?: RateLimiter;
  semaphore?: Semaphore;
  /** Máximo de bytes del cuerpo (por defecto 64 KiB). */
  maxBody?: number;
  /** Responder 503 durante el apagado ordenado. */
  rejectWhenDraining?: boolean;
}

export interface GuardedContext<RouteContext> {
  request: Request;
  requestId: string;
  principal: string;
  route: RouteContext;
  readBody: () => Promise<Uint8Array>;
  readJson: () => Promise<unknown>;
  /**
   * Para respuestas en streaming: el semáforo no se libera al devolver la
   * respuesta sino cuando el manejador llama a la función devuelta.
   */
  deferRelease: () => () => void;
}

export type GuardedHandler<RouteContext> = (context: GuardedContext<RouteContext>) => Promise<Response>;

const DEFAULT_MAX_BODY = 64 * 1024;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApiGuards(config: GuardConfig) {
  return function withGuards<RouteContext>(
    handler: GuardedHandler<RouteContext>,
    options: RouteGuardOptions = {},
  ): (request: Request, route: RouteContext) => Promise<Response> {
    const maxBody = options.maxBody ?? DEFAULT_MAX_BODY;

    return async (request, route) => {
      const requestId =
        (config.origin.trustProxyHops > 0 ? request.headers.get("x-request-id")?.slice(0, 64) : undefined) ||
        config.newRequestId();
      const fail = (status: number, code: Parameters<typeof jsonError>[1], message: string, headers?: Record<string, string>) =>
        jsonError(status, code, message, { requestId, ...(headers ? { headers } : {}) });

      // 1. Host
      if (!isAllowedHost(request.headers, config.origin)) {
        return fail(421, "MISDIRECTED_HOST", "Host no permitido");
      }

      // 2. Autenticación
      let principal = "anonymous";
      if (options.auth !== false) {
        const result = authenticate(request.headers, config.auth);
        if (!result.ok) {
          return fail(401, "UNAUTHORIZED", "Autenticación requerida", result.challenge ? { "WWW-Authenticate": BASIC_REALM } : undefined);
        }
        principal = result.principal;
      }

      // 3. Content-Type y mismo origen
      const unsafeMethod = !SAFE_METHODS.has(request.method);
      if (unsafeMethod && options.contentTypes && !hasContentType(request.headers, options.contentTypes)) {
        return fail(415, "UNSUPPORTED_MEDIA_TYPE", `Content-Type no admitido; se espera ${options.contentTypes.join(" o ")}`);
      }
      if ((options.csrf ?? unsafeMethod) && !isSameOrigin(request.headers, config.origin)) {
        return fail(403, "FORBIDDEN_ORIGIN", "Origen de la petición no permitido");
      }

      if (options.rejectWhenDraining && config.isDraining()) {
        return fail(503, "DRAINING", "El servidor se está reiniciando; vuelve a intentarlo en unos segundos", { "Retry-After": "10" });
      }

      // 4. Rate limit por principal (o IP del salto de confianza)
      if (options.rateLimit) {
        const key = principal !== "anonymous" ? principal : (clientIp(request.headers, config.origin.trustProxyHops) ?? "anonymous");
        const decision = options.rateLimit.take(key);
        if (!decision.allowed) {
          return fail(429, "RATE_LIMITED", `Demasiadas solicitudes; vuelve a intentarlo en ${decision.retryAfterSeconds} s`, {
            "Retry-After": String(decision.retryAfterSeconds),
          });
        }
      }

      // 5. Semáforo sin cola
      let release: (() => void) | null = null;
      if (options.semaphore) {
        release = options.semaphore.tryAcquire();
        if (!release) return fail(429, "BUSY", "El servidor está ocupado con otra operación; vuelve a intentarlo", { "Retry-After": "5" });
      }

      let deferred = false;
      try {
        // 6. Content-Length declarado
        const declared = request.headers.get("content-length");
        if (declared !== null && Number(declared) > maxBody) {
          return fail(413, "PAYLOAD_TOO_LARGE", `El cuerpo supera el máximo de ${maxBody} bytes`);
        }

        // 7. Manejador; el cuerpo solo se lee con límite
        const response = await handler({
          request,
          requestId,
          principal,
          route,
          readBody: () => readBodyCapped(request, maxBody),
          readJson: () => readJsonCapped(request, maxBody),
          deferRelease: () => {
            deferred = true;
            return release ?? (() => {});
          },
        });
        response.headers.set("X-Request-Id", requestId);
        return response;
      } catch (error) {
        if (error instanceof HttpError) {
          return jsonError(error.status, error.code, error.message, { requestId, details: error.details });
        }
        config.logError("Error no controlado en la API", {
          requestId,
          route: new URL(request.url).pathname,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        });
        return fail(500, "INTERNAL", `Error interno. Referencia: ${requestId}`);
      } finally {
        if (!deferred) release?.();
      }
    };
  };
}
