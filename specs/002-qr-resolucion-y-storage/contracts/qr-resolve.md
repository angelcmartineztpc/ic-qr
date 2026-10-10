# Contrato: `POST /api/qr/resolve`

Archivo: `src/app/api/qr/resolve/route.ts`. Único productor de QR. Diseño: `docs/ARCHITECTURE.md` §A.5 (endpoint 2), §S2.

## Guardas (`withApiGuards`)

Orden: Host (421) → autenticación (401) → `Content-Type` y origen (415, 403) → rate limit (429) → tamaño (413) → cuerpo.

| Opción | Valor |
|---|---|
| `contentTypes` | `["application/json"]` |
| `csrf` | por defecto (activo en POST): `Sec-Fetch-Site` `same-origin`/`none` u `Origin` en `APP_ORIGINS` |
| `rateLimit` | `getLimits().resolve` (`RATE_LIMIT_RESOLVE_PER_MIN`, 30 por defecto) |
| `maxBody` | 512 KiB |
| `semaphore` | ninguno |

## Petición

```json
{
  "items":  [{ "recordId": "string(1..64)", "menuUrl": "string(≤4096)", "expectedRevision": 0 }],
  "verify": [{ "recordId": "string(1..64)", "qrUrl": "string(≤4096)", "menuUrl": "string(≤4096)" }]
}
```

- `items` y `verify` son opcionales (por defecto `[]`), máximo 100 elementos cada uno (`QR_RESOLVE_MAX_BATCH` de `src/schemas/api.ts`), y no pueden estar ambos vacíos (`La petición está vacía`).
- Objeto raíz y elementos de `verify` son `strictObject`. Los elementos de `items` se validan uno a uno en el servidor: uno con claves `qrUrl` o `qr` falla con `unsafe-url` sin generar; uno mal formado falla con `encode-failed`; el lote no se rompe.
- Además, `items.length + verify.length` no puede superar `QR_RESOLVE_MAX_BATCH` del entorno (por defecto 100): 400 `Máximo N registros por llamada`.

## Respuesta 200

```json
{
  "results": [ QrResolution ],
  "created": 0, "reused": 0, "failed": 0
}
```

`results` lleva primero los de `items` y luego los de `verify`. `QrResolution` (ver [`data-model.md`](../data-model.md)):

| `outcome` | Campos | Cuándo |
|---|---|---|
| `generated` | `recordId`, `qrUrl`, `qr` | Primera pieza de una clave recién creada |
| `reused` | `recordId`, `qrUrl`, `qr` | El archivo ya existía, o es otra pieza del mismo lote con la misma clave |
| `existing-ok` | `recordId`, `qr` (`source: "existing"`) | Recurso verificado (decodificado o `undecodable`) |
| `failed` | `recordId`, `error { code, message }` | Fallo de esa pieza |

`created` cuenta claves nuevas, `reused` las piezas que compartieron o encontraron el archivo, `failed` el total de resultados `failed` (generación y verificación).

## Errores HTTP

| Estado | `code` | Causa |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Esquema inválido (hasta 10 issues con `path` y `message`) o lote mayor que el máximo |
| 400 | `BAD_REQUEST` | Cuerpo no JSON |
| 401 | `UNAUTHORIZED` | Sin credenciales válidas (con `WWW-Authenticate` en modo `basic`) |
| 403 | `FORBIDDEN_ORIGIN` | Origen no permitido |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo mayor de 512 KiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` distinto de `application/json` |
| 421 | `MISDIRECTED_HOST` | Host fuera de `APP_ALLOWED_HOSTS` |
| 429 | `RATE_LIMITED` | Rate limit (con `Retry-After`) |
| 500 | `INTERNAL` | Error no controlado (con `requestId`) |

El cuerpo de error es `{ code, message, requestId, details? }` con `Cache-Control: no-store` y `X-Request-Id`.

## Códigos de error por pieza (`results[].error.code`)

- Generación: `unsafe-url` (ítem con `qrUrl`/`qr`), `encode-failed` (ítem inválido, `menuUrl` inválido o de más de 1273 caracteres), `storage-conflict`, `quota-exceeded`, `storage-failed`.
- Verificación: `unsafe-url`, `host-not-allowed`, `timeout`, `unreachable`, `too-large`, `raster-only`, `unsupported-type` (PDF), `not-an-image`, `invalid-svg`, `storage-failed`.

Nota: la cuota agotada no devuelve HTTP 429; se informa por pieza como `quota-exceeded` (el §S2.2 de la arquitectura habla de 429 `RATE_LIMITED`; el código lo implementa por pieza).

## Efectos

- Generación: crea `[prefijo/]qr/v1/{sha256}.svg` si no existe (`PUT` condicional o `HEAD`+`PUT`).
- Verificación: crea `[prefijo/]qr/ext/v1/{assetSha256}.json` (idempotente). No escribe ningún QR.
- Tests: `tests/integration/api-qr.test.ts`, `src/server/qr/resolve.test.ts`, `src/server/qr/verify-existing.test.ts`.
