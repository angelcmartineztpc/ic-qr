# Data Model: Plataforma, seguridad y despliegue

Fuentes: `src/server/config/env-schema.ts`, `src/server/http/*`, `scripts/fonts-lib.mts`, `scripts/setup-fonts.mts`, `assets/fonts/*/manifest.json`.

## Env (`EnvSchema` → `Env`)

Variables por grupo (valores por defecto entre paréntesis; la lista completa con comentarios está en `.env.example`).

| Grupo | Variables |
|---|---|
| App | `NODE_ENV` (`development`), `NEXT_PUBLIC_APP_URL`, `APP_ORIGINS`, `APP_ALLOWED_HOSTS` (listas separadas por coma; en no producción se rellenan con `localhost:3000` y `127.0.0.1:3000`), `TRUST_PROXY_HOPS` (0), `LOG_LEVEL` (`info`), `LOG_FORMAT` (`json`) |
| Autenticación | `AUTH_MODE` (`none`), `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD_SHA256`, `PROXY_SHARED_SECRET`, `ALLOW_UNAUTHENTICATED` (false) |
| Storage | `STORAGE_PROVIDER` (`local`), `STORAGE_BUCKET`, `STORAGE_REGION` (`auto`), `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_FORCE_PATH_STYLE`, `STORAGE_PUBLIC_BASE_URL` (`http://localhost:3000/api/storage`), `STORAGE_KEY_PREFIX`, `STORAGE_CONDITIONAL_PUT` (`auto`), `STORAGE_MAX_CONCURRENCY` (16), `STORAGE_LOCAL_DIR` (`./.data/storage`), `ALLOW_LOCAL_STORAGE_IN_PROD` |
| Fuentes | `FONTS_DIR` (`./assets/fonts`) |
| QR | `QR_HOST_POLICY` (`public`), `QR_ALLOWED_HOSTS`, `QR_FETCH_TIMEOUT_MS` (5000), `QR_FETCH_MAX_BYTES` (524288), `QR_FETCH_DIRECT_EGRESS_CONFIRMED`, `QR_RESOLVE_MAX_BATCH` (100), `QR_MAX_NEW_OBJECTS_PER_HOUR` (2000) |
| Límites | `IMPORT_MAX_BYTES` (10 485 760), `IMPORT_MAX_ROWS` (5000), `IMPORT_MAX_ENTRY_INFLATED`, `IMPORT_MAX_TOTAL_INFLATED`, `IMPORT_MAX_CELLS`, `IMPORT_MAX_CONCURRENCY` (2), `EXPORT_MAX_RECORDS` (5000), `EXPORT_MAX_BODY_BYTES` (8 388 608), `EXPORT_MAX_CONCURRENCY` (2), `EXPORT_TIMEOUT_MS` (60 000) |
| Rate limit (por minuto) | `RATE_LIMIT_RESOLVE_PER_MIN` (30), `RATE_LIMIT_IMPORT_PER_MIN` (10), `RATE_LIMIT_EXPORT_PER_MIN` (6), `RATE_LIMIT_ASSET_PER_MIN` (300), `RATE_LIMIT_PREVIEW_PER_MIN` (600) |
| Proxy de salida | `HTTP_PROXY`, `HTTPS_PROXY`, `NODE_USE_ENV_PROXY`: solo se leen para la regla de arranque |

Secretos con variante `*_FILE` (`FILE_SECRETS`): `BASIC_AUTH_PASSWORD_SHA256`, `PROXY_SHARED_SECRET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`. Si existe la variable directa, `*_FILE` se ignora.

Variables que no están en `EnvSchema` y se usan: `NEXT_PUBLIC_QR_DOMAIN` (build-time, link estable), `FONTS_SOURCE_DIR` (solo `fonts:setup`), `PORT` y `HOSTNAME` (fijados en la imagen), `E2E_PORT` (Playwright).

### Reglas de validación cruzadas (`superRefine`)

1. `AUTH_MODE=none` en producción sin `ALLOW_UNAUTHENTICATED` → error en `AUTH_MODE`.
2. `AUTH_MODE=basic` → `BASIC_AUTH_USER` obligatorio y `BASIC_AUTH_PASSWORD_SHA256` de 64 hex.
3. `AUTH_MODE=proxy` → `PROXY_SHARED_SECRET` de al menos 32 caracteres.
4. Producción → `APP_ORIGINS` y `APP_ALLOWED_HOSTS` no vacías; storage local con base `http:`/`localhost`/`127.0.0.1` solo con `ALLOW_LOCAL_STORAGE_IN_PROD`.
5. `STORAGE_PROVIDER=s3` → `STORAGE_BUCKET`.
6. `QR_HOST_POLICY=allowlist` → `QR_ALLOWED_HOSTS` no vacía.
7. Variables de proxy de salida → `QR_FETCH_DIRECT_EGRESS_CONFIRMED=true`.
8. `STORAGE_KEY_PREFIX`: un solo segmento `[a-z0-9-]+` con `/` final opcional.

## AuthConfig y AuthResult

- `AuthConfig`: `{ mode: "none" | "basic" | "proxy", basicUser?, basicPasswordSha256?, proxySecret? }`.
- `AuthResult`: `{ ok: true, principal }` o `{ ok: false, challenge }`. Principales: `anonymous`, `basic:<usuario>`, `proxy[:<X-Forwarded-User>]`. `challenge` es verdadero solo en `basic` (provoca `WWW-Authenticate: Basic realm="QR Production Generator", charset="UTF-8"`).

## Guardas

- `GuardConfig`: `auth`, `origin` (`allowedHosts`, `allowedOrigins`, `trustProxyHops`), `isDraining`, `logError`, `newRequestId`.
- `RouteGuardOptions`: `auth` (true), `csrf` (true en métodos no seguros), `contentTypes`, `rateLimit`, `semaphore`, `maxBody` (65 536), `rejectWhenDraining`.
- `GuardedContext`: `request`, `requestId`, `principal`, `route`, `readBody`, `readJson`, `deferRelease` (para respuestas en streaming).
- `RateLimiter`: token bucket por clave con capacidad igual al cupo por minuto, recarga continua y máximo 10 000 claves (se descarta la más antigua).
- `Semaphore`: capacidad fija sin cola; `tryAcquire()` devuelve una función de liberación idempotente o `null`.
- `Limits` (`getLimits()`): limitadores `resolve`, `import`, `export`, `asset`, `preview` y semáforos `importSlots` y `exportSlots`.

## ApiErrorCode

`BAD_REQUEST`, `NOT_FOUND`, `FONTS_MISSING`, `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN_ORIGIN`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `MISDIRECTED_HOST`, `RATE_LIMITED`, `BUSY`, `DRAINING`, `EXPORT_TIMEOUT`, `EXPORT_CANCELLED`, `QR_IDENTITY_MISMATCH`, `QR_UNRESOLVED`, `INTERNAL`. Carga: `AppErrorPayload { code, message, requestId, details?, recordId? }`.

## FontManifest (`assets/fonts/<familia>/manifest.json`)

`{ family, version, license, note?, files: { "<archivo>.woff2": FontEntry } }` con `FontEntry { weight, sha256, postscriptName?, advances? }`.

| Familia | Archivos | Verificación |
|---|---|---|
| `gotham` (v3.301) | `Gotham-Book` (400), `Gotham-Medium` (500), `Gotham-Bold` (700), `Gotham-Black` (800) | nombre PostScript y `sha256` |
| `address-sans` | `AddressSansPro-CdSemibold` (600) | nombre PostScript, huella de anchos (`0`: 450, `1`: 286, `M`: 613, `T`: 358, `O`: 450, `A`: 415 por 1000 em) y `sha256` |

`FontCandidate { path, postscriptName, isWoff2 }` describe cada fuente hallada en la máquina.

## Apagado ordenado

Booleano en `globalThis[Symbol.for("qr-production-generator.draining")]`. Se activa con `SIGTERM` (`boot.ts`) y nunca se desactiva durante la vida del proceso.
