# Contrato: GET /api/qr/{resortCode}/{service}

Fuente: `src/app/api/qr/[resortCode]/[service]/route.ts`; tests en `route.test.ts`.

## Petición

- Método: `GET` (único método exportado).
- Parámetros de ruta:
  - `resortCode`: uno de `PRPL`, `LBCU`, `LBLC`, `MPCU`, `MPNI`, `PRBP`, `PRCZ`, `TGCU`, `TGPC` (comparación exacta, distingue mayúsculas).
  - `service`: `pool` o `restaurant`.
- Sin cuerpo, sin consulta y sin cabeceras requeridas. No se autentica y no usa `withApiGuards`.

## Respuestas

| Estado | Cuándo | Cabeceras | Cuerpo |
|---|---|---|---|
| `302` | Resort y servicio válidos | `Location: {destino}`, `Cache-Control: no-store` | vacío |
| `404` | Resort o servicio fuera de la lista | `Content-Type: application/json`, `Cache-Control: no-store` | `{"error":"Resort o servicio desconocido"}` |

Destino (`serviceUrls` en `src/lib/resorts/properties.ts`):

- `pool`: `https://pool-service.palaceresorts.com/pool-area/{resortCode}`
- `restaurant`: `https://pool-service.palaceresorts.com/restaurant/{resortCode}`

Ejemplo verificado en test: `GET /api/qr/TGPC/pool` -> `302`, `Location: https://pool-service.palaceresorts.com/pool-area/TGPC`.

## Invariantes

- `Location` proviene solo de la lista; ningún dato de la petición se refleja en la respuesta salvo para decidir 302 o 404.
- Nunca se cachea (`no-store`) para que un cambio de destino sea inmediato tras el deploy.
- No devuelve 401, 403, 415 ni 429: no hay guardas (ver «Seguridad de la ruta pública» en el spec).

## URL que se graba en el QR

`{NEXT_PUBLIC_QR_DOMAIN o window.location.origin}/api/qr/{resortCode}/{service}`, sin barra final del dominio (`buildServiceUrl`).
