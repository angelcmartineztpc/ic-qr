# Contrato: `GET /api/qr/asset`

Archivo: `src/app/api/qr/asset/route.ts`. Entrega la geometría saneada de un QR existente para la vista previa (§A.5, endpoint 3).

## Guardas (`withApiGuards`)

| Opción | Valor |
|---|---|
| Autenticación | requerida (por defecto) |
| `csrf` | `true` explícito (por defecto sería inactivo en GET): exige `Sec-Fetch-Site` `same-origin`/`none` u `Origin` permitido |
| `rateLimit` | `getLimits().asset` (`RATE_LIMIT_ASSET_PER_MIN`, 300 por defecto) |
| `contentTypes` | no aplica (GET) |

## Petición

Query `key=<snapshotKey>`. Debe cumplir `isValidKey` y `/\/?qr\/ext\/v\d+\/[0-9a-f]{64}\.json$/`: una clave de QR generado (`.svg`), una ruta inventada o una clave vacía dan 400.

## Respuestas

| Estado | `code` | Causa |
|---|---|---|
| 200 | — | JSON `{ viewBox, nodes, strokeBased }` (la `geometry` de la instantánea), `Cache-Control: private, max-age=3600` |
| 400 | `VALIDATION_FAILED` | Clave no válida |
| 404 | `NOT_FOUND` | La instantánea no existe |
| 422 | `VALIDATION_FAILED` | JSON dañado o que no cumple `ExternalSnapshotSchema` |
| 401, 403, 421, 429 | `UNAUTHORIZED`, `FORBIDDEN_ORIGIN`, `MISDIRECTED_HOST`, `RATE_LIMITED` | Guardas |

Tests: `tests/integration/api-qr.test.ts` (bloque «GET /api/qr/asset»).
