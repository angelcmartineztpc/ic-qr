# Contrato: guardas HTTP (`withApiGuards`)

Archivos: `src/server/http/guards.ts`, `index.ts`, `origin.ts`, `auth.ts`, `rate-limit.ts`, `semaphore.ts`, `read-body.ts`, `errors.ts`. Diseño: `docs/ARCHITECTURE.md` §A.5 y §S8. Tests: `src/server/http/guards.test.ts`, `rate-limit.test.ts`.

## Uso

```ts
export const POST = withApiGuards(handler, () => ({ contentTypes: ["application/json"], rateLimit: getLimits().resolve, maxBody: 512 * 1024 }));
```

Las opciones se pasan como función para resolverse en la primera petición. El manejador recibe `ctx.request`, `ctx.requestId`, `ctx.principal`, `ctx.readBody()`, `ctx.readJson()` y `ctx.deferRelease()`. ESLint prohíbe `request.json()`, `formData()`, `arrayBuffer()`, `text()` y `blob()` en `src/app/api/**`.

## Orden de evaluación y respuestas

| Paso | Condición de fallo | Estado | `code` | Cabeceras extra |
|---|---|---|---|---|
| 1. Host | `Host` (o `X-Forwarded-Host` con `TRUST_PROXY_HOPS` > 0) no está en `APP_ALLOWED_HOSTS` | 421 | `MISDIRECTED_HOST` | — |
| 2. Autenticación (si `auth !== false`) | `authenticate` falla | 401 | `UNAUTHORIZED` | `WWW-Authenticate` solo en `basic` |
| 3a. Content-Type (métodos no seguros con `contentTypes`) | MIME exacto (sin parámetros) fuera de la lista | 415 | `UNSUPPORTED_MEDIA_TYPE` | — |
| 3b. Origen (si `csrf`, por defecto en métodos no seguros) | `Sec-Fetch-Site` `cross-site`/`same-site`, o sin `Sec-Fetch-Site` y `Origin` fuera de `APP_ORIGINS` | 403 | `FORBIDDEN_ORIGIN` | — |
| Apagado (si `rejectWhenDraining`) | `isDraining()` | 503 | `DRAINING` | `Retry-After: 10` |
| 4. Rate limit (si `rateLimit`) | token bucket agotado para el principal (o IP del salto de confianza) | 429 | `RATE_LIMITED` | `Retry-After` en segundos |
| 5. Semáforo (si `semaphore`) | sin hueco; nunca se encola | 429 | `BUSY` | `Retry-After: 5` |
| 6. Content-Length | declarado mayor que `maxBody` (65 536 por defecto) | 413 | `PAYLOAD_TOO_LARGE` | — |
| 7. Cuerpo | `readBodyCapped` supera el límite (también en chunked) → 413; JSON inválido → 400 `BAD_REQUEST` | 413 / 400 | — | — |

Métodos seguros: `GET`, `HEAD`, `OPTIONS`.

## Respuesta de error

```json
{ "code": "…", "message": "…", "requestId": "…", "details": "…opcional…" }
```

Cabeceras `Cache-Control: no-store` y `X-Request-Id`. `HttpError(status, code, message, details?)` lanzado por un manejador se convierte en esta respuesta. Cualquier otro error: 500 `INTERNAL` con `Error interno. Referencia: <requestId>`; el detalle y la traza van solo al log (`logError`).

## Identificador de petición

`X-Request-Id` entrante (recortado a 64 caracteres) solo se acepta con `TRUST_PROXY_HOPS` > 0; si no, se genera con `randomUUID`. Las respuestas correctas del manejador reciben `X-Request-Id`.

## Rutas actuales y sus opciones

| Ruta | Guardas relevantes |
|---|---|
| `POST /api/qr/resolve` | JSON, rate limit `resolve`, 512 KiB (ver feature 002) |
| `GET /api/qr/asset` | `csrf: true`, rate limit `asset` |
| `POST /api/import/excel`, `POST /api/export`, `POST /api/preview/tiles` | `withApiGuards`; `import` y `export` con `rejectWhenDraining: true` |

## Rutas sin guardas (públicas por diseño)

- `GET /api/health` (ver [`health.md`](health.md)).
- `GET /api/storage/[...key]` (solo proveedor local; clave validada por regex).
- `GET /api/qr/[resortCode]/[service]` (redirect 302 del link estable).

`src/proxy.ts` autentica las páginas con el mismo `authenticate`; su matcher excluye `/api/`, `/_next/static/`, `/_next/image/`, `favicon.ico` y `robots.txt`. Respuesta sin autenticar: 401 `text/plain; charset=utf-8` con `Cache-Control: no-store` (y `WWW-Authenticate` en `basic`).
