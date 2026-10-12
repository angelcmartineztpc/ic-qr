# Contrato: `GET /api/health`

Archivo: `src/app/api/health/route.ts`. Usado por el `HEALTHCHECK` del `Dockerfile` y por Playwright (`webServer.url`).

## Guardas

Ninguna: exento de `withApiGuards` y de `src/proxy.ts` (el matcher excluye `/api/`). Responde sin datos internos: no expone versión ni tipo de storage (esos datos van solo al log de arranque, §S8).

## Respuestas

| Estado | Cuerpo | Condición |
|---|---|---|
| 200 | `{ "ok": true }` | La app no está en apagado ordenado |
| 503 | `{ "ok": false }` | Tras `SIGTERM` (`isDraining()`) |

Cabecera `Cache-Control: no-store`. Nota: `next.config.ts` también añade `Cross-Origin-Resource-Policy: same-origin` y `no-store` a `/api/*` salvo `/api/storage/`.

## Uso en el contenedor

`HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3` ejecuta `fetch('http://127.0.0.1:3000/api/health')` con `node -e` y sale con 0 solo si la respuesta es correcta.

Tests: `tests/integration/api-import.test.ts` comprueba que responde con estado menor que 500 tras una importación hostil; `tests/e2e/import.spec.ts` comprueba `ok()`. No hay test dedicado del 503 de apagado.
