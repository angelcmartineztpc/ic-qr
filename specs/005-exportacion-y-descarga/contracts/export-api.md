# Contrato: `POST /api/export`

Leído de `src/app/api/export/route.ts`, `src/schemas/export.ts`, `src/schemas/pdf.ts`, `src/schemas/record.ts`, `src/lib/export/frames.ts`, `src/server/export/run-export.ts`, `src/server/http/guards.ts` y `src/server/http/errors.ts`. Decisión de diseño: `docs/ARCHITECTURE.md` §A.5 y §S5.

## Petición

- Método y ruta: `POST /api/export`.
- Cabecera `Content-Type: application/json` exacto; cualquier otro da 415.
- Misma procedencia (`Sec-Fetch-Site` o `Origin`); si no, 403 `FORBIDDEN_ORIGIN`.
- Autenticación según `AUTH_MODE` (401 `UNAUTHORIZED`, con `WWW-Authenticate` en modo `basic`).
- Cuerpo máximo: `EXPORT_MAX_BODY_BYTES` (8 388 608 por defecto); si no, 413 `PAYLOAD_TOO_LARGE`.

### Cuerpo (`ExportRequestSchema`, estricto: se rechazan campos extra)

| Campo | Tipo | Regla |
|---|---|---|
| `records` | `ExportRecord[]` | 1 a 5000 (`EXPORT_MAX_RECORDS`, también se comprueba contra el entorno); ids únicos |
| `templateId` | string | debe existir en `src/templates`; igual a `layout.templateId` |
| `templateOverrides` | `TemplateOverrides` | `{ items, qr, tile }`; se fusiona y se revalida con la plantilla |
| `layout` | `ProjectLayout` | `{ templateId, base, overrides }` |
| `options` | `ExportOptions` | ver abajo |

`ExportRecord` (proyección mínima; `src/lib/export/build-request.ts#projectRecord`): `id` (1–64), `area`, `estacion`, `mesa`, `subgrupo`, `concepto`, `menuUrl`, `qrUrl` (≤ 2048), `qr` (`QrSourceInfo`) y `qrAck` opcional. Área, Mesa y Link del menú son obligatorios. El esquema estricto rechaza: `qr.source = "none"` («QR no resuelto»), un QR generado desactualizado sin confirmación válida («QR desactualizado (stale) sin confirmar»), un QR existente sin verificar, ilegible sin confirmar o que apunta a otra URL sin confirmar.

`ExportOptions`:

| Campo | Valores | Por defecto |
|---|---|---|
| `fileName` | string ≤ 200, saneado (≤ 120, sin extensión `.pdf`, sin `/ \ : * ? " < > \|`, reservados de Windows con `_`); vacío tras sanear es error «Nombre de archivo vacío» | obligatorio |
| `formats` | lista no vacía de `"pdf"`, `"svgZip"` | `["pdf"]` |
| `pdf` | `PDFOptions` (abajo) | obligatorio; cada campo tiene su valor por defecto |
| `svg` | `{ textMode: "outlined" \| "live", cutLine: boolean }` | `{ "live", false }` |
| `zipNaming` | `"index"` \| `"index-area-mesa"` | `"index"` |

`PDFOptions`: `mode` (`sheet` \| `single`; `sheet`), `pageSize` (`{kind:"A4"}` \| `{kind:"Letter"}` \| `{kind:"custom", widthMm, heightMm}` de 10 a 1500; A4), `orientation` (`portrait` \| `landscape` \| `auto`; `portrait`), `margins` (`top/right/bottom/left` 0–100; 10), `gapMm` (0–50; 5), `bleedMm` (0–5; 0), `maxCols` y `maxRows` (enteros 1–50; opcionales), `center` (`true`), `textMode` (`outlined` \| `live`; `live`), `cutLine` (`none` \| `rgb` \| `spot`; `none`), `colorSpace` (`rgb` \| `cmyk`; `rgb`), `includeQrBackground` (`true`). `PDF_DEFAULTS` está en `src/schemas/pdf.ts`.

## Respuesta con error previo al stream (JSON, `AppErrorPayload`)

Forma: `{ code, message, requestId, details?, recordId? }`, con `Cache-Control: no-store` y `X-Request-Id`.

| Estado | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_FAILED` | esquema inválido (hasta 20 entradas en `details`: `{path, message, recordId?}`), plantilla desconocida, ajustes de plantilla inválidos, más registros que `EXPORT_MAX_RECORDS` |
| 400 | `BAD_REQUEST` | el cuerpo no es JSON válido |
| 400 | `QR_IDENTITY_MISMATCH` | clave o link del QR manipulados; `details: { recordId }` |
| 401 | `UNAUTHORIZED` | sin credenciales válidas |
| 403 | `FORBIDDEN_ORIGIN` | petición de otro origen |
| 413 | `PAYLOAD_TOO_LARGE` | cuerpo demasiado grande |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` distinto de `application/json` |
| 421 | `MISDIRECTED_HOST` | `Host` no permitido |
| 429 | `RATE_LIMITED` | límite por minuto (6 por defecto); `Retry-After` en segundos |
| 429 | `BUSY` | 2 exportaciones simultáneas por instancia (sin cola); `Retry-After: 5` |
| 503 | `DRAINING` | apagado ordenado; `Retry-After: 10` |
| 503 | `FONTS_MISSING` | faltan las fuentes de las piezas en el servidor |

El orden de las guardas es host, autenticación, `Content-Type` y origen, apagado, rate limit, semáforo y tamaño (`src/server/http/guards.ts`).

## Respuesta 200: stream de tramas

Cabeceras: `Content-Type: application/octet-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`, `X-Content-Type-Options: nosniff`.

Cada trama: `[tipo: u8][longitud: u32 big-endian][payload]`.

| Tipo | Nombre | Payload |
|---|---|---|
| 1 | `PROGRESS` | JSON `{ phase: "generating" \| "preparing", done, total }`; como máximo 10 por segundo; al final `preparing` con `done = total` |
| 2 | `FILE_META` | JSON `{ fileId: "pdf" \| "zip", name, size, mime }`; `name` es `<fileName>.pdf` o `<fileName>.zip`, `mime` `application/pdf` o `application/zip` |
| 3 | `FILE_CHUNK` | `[fileId: u8][bytes]`, `fileId` 1 = pdf, 2 = zip; trozos de hasta 65 536 bytes |
| 4 | `DONE` | JSON `{ pages, pieces, warnings }`; `pages` es 0 si solo se pidió el ZIP |
| 5 | `WARNING` | JSON `{ recordId?, code, message }`; avisos de composición por pieza (texto en español) |
| 6 | `ERROR` | JSON `AppErrorPayload`; termina el stream |

Orden: `PROGRESS` y `WARNING` durante las piezas; después `PROGRESS(preparing)`; `FILE_META` y sus `FILE_CHUNK` del PDF (si se pidió), luego los del ZIP; `DONE`. El PDF se acumula en memoria para enviar el `size` exacto.

### Errores dentro del stream (trama `ERROR`)

| `code` | Cuándo |
|---|---|
| `EXPORT_TIMEOUT` | se agotó `EXPORT_TIMEOUT_MS` (60 000 por defecto); mensaje «La exportación tardó demasiado y se canceló» |
| `QR_UNRESOLVED` | una instantánea de QR existente ya no está en el storage; lleva `recordId` |
| `INTERNAL` | fallo inesperado; mensaje «Error interno al generar el PDF. Referencia: <requestId>» |

Si el cliente cancela (cierra la conexión), el servidor detiene el bucle y no emite `ERROR`; solo registra «Exportación cancelada por el cliente». El semáforo se libera al terminar el stream en todos los casos.

## Garantías

- Solo lectura del storage: la ruta no sube archivos ni genera QR (verificado en `tests/integration/export.test.ts`).
- La numeración de piezas del PDF y del ZIP es 1…n sobre `records`, en su orden.
- Nombres del ZIP: `001.svg…` (relleno `max(3, dígitos(total))`) o `001-<slug>.svg` con `zipNaming: "index-area-mesa"` (slug de «área mesa», sin acentos, ≤ 60 caracteres).
- Cliente de referencia: `src/lib/export/client.ts#runExportJob`; un stream que termina sin `DONE` ni `ERROR` se interpreta como `STREAM_TRUNCATED`.
