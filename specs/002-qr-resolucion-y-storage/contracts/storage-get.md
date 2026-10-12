# Contrato: `GET /api/storage/[...key]`

Archivo: `src/app/api/storage/[...key]/route.ts`. Sirve los QR y las instantáneas del proveedor **local** (§A.5, endpoint 5; §S3).

## Guardas

Ninguna: es público y no usa `withApiGuards`, para que los `qrUrl` se abran fuera de la aplicación (igual que el redirect del link estable y `/api/health`). No pasa por `src/proxy.ts` porque su matcher excluye `/api/`. La única defensa es la validación estricta de la clave.

## Petición

Ruta `/api/storage/{key}`, donde la clave (`parts.join("/")`) debe cumplir `KEY_PATTERN`: `[prefijo/]qr/v{n}/{sha256}.svg` o `[prefijo/]qr/ext/v{n}/{sha256}.json`.

## Respuestas

| Estado | Condición | Cabeceras |
|---|---|---|
| 200 | Objeto encontrado | `Content-Type` (`image/svg+xml` o `application/json`), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `Cross-Origin-Resource-Policy: cross-origin`, `Content-Disposition: inline; filename="<último segmento de la clave>"`, `ETag` si el objeto lo tiene |
| 304 | `If-None-Match` igual al `ETag` | mismas cabeceras, sin cuerpo |
| 404 | `STORAGE_PROVIDER` distinto de `local`, clave no válida u objeto inexistente | cuerpo `No encontrado`, `Cache-Control: no-store` |

`next.config.ts` excluye `/api/storage/` de las cabeceras `Cross-Origin-Resource-Policy: same-origin` y `Cache-Control: no-store` que aplica al resto de `/api/*`.

Con un proveedor S3 la ruta responde 404 y sirve el bucket (o el CDN configurado en `STORAGE_PUBLIC_BASE_URL`).

Tests: `tests/integration/api-qr.test.ts` (bloque «GET /api/storage/[...key]»): 200 con cabeceras, 304, 404 para `../../etc/passwd`, `qr/v1/../../x.svg`, extensión `.png`, ruta ajena y clave inexistente, y 404 con proveedor S3.
