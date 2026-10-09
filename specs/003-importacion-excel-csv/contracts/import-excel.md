# Contrato: `POST /api/import/excel`

Handler: `src/app/api/import/excel/route.ts` (declarado con `withApiGuards`). Lógica: `src/server/excel/import-excel.ts`. Cliente: `src/lib/app/import-client.ts` (`uploadExcel`). Esquemas: `src/schemas/import.ts`. Pruebas: `tests/integration/api-import.test.ts`.

## Petición

Cuerpo binario con el archivo (no multipart). El archivo se lee en memoria y nunca se guarda.

| Cabecera | Obligatoria | Contenido |
|---|---|---|
| `Content-Type` | sí | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/octet-stream`, `text/csv` o `application/vnd.ms-excel`; otro valor (p. ej. `text/plain`, `multipart/form-data`) responde 415 |
| `X-File-Name` | no | `encodeURIComponent(nombre)`; el servidor decodifica, normaliza NFC, quita `\p{Cc}\p{Cf}` y recorta a 255 caracteres; por defecto `archivo.xlsx` |
| `X-Column-Mapping` | no | base64url de `{sheet?, columns: {"A": "area" \| null, ...}}`; hasta 8 KB (`COLUMN_MAPPING_HEADER_MAX_BYTES`); un campo no puede ir en dos columnas |
| `X-Import-Truncate` | no | entero entre 1 y `IMPORT_MAX_ROWS`; importa solo las primeras N filas |
| `X-Default-Menu-Url` | no | `encodeURIComponent(url)`; se recorta a 2048 caracteres |

El cliente envía el MIME del libro cuando el navegador lo da y `application/octet-stream` en el resto (los CSV incluidos).

## Guardas y límites (variables de entorno, valores por defecto)

| Límite | Valor | Variable |
|---|---|---|
| Cuerpo máximo | 10 485 760 bytes | `IMPORT_MAX_BYTES` |
| Filas de datos | 5000 | `IMPORT_MAX_ROWS` |
| Inflado por entrada | 20 971 520 bytes | `IMPORT_MAX_ENTRY_INFLATED` |
| Inflado total | 41 943 040 bytes | `IMPORT_MAX_TOTAL_INFLATED` |
| Celdas | 300 000 | `IMPORT_MAX_CELLS` |
| Importaciones concurrentes | 2 (sin cola) | `IMPORT_MAX_CONCURRENCY` |
| Importaciones por minuto | 10 | `RATE_LIMIT_IMPORT_PER_MIN` |
| Entradas del ZIP, ratio, columnas, lectura | 2000, 200, 50, 10 s | fijos en código |

La ruta usa `rejectWhenDraining: true`. El orden de guardas lo fija `withApiGuards` (host, autenticación, tipo de contenido y origen, límite de tasa, concurrencia, tamaño).

## Respuestas

- **200** `{ ok: true, result: ImportResult }`. También cuando faltan columnas obligatorias: entonces `totalRows = 0`, `missingColumns` o columnas ambiguas y ninguna fila procesada.
- **413 / 415 / 422** `{ ok: false, issues: ImportIssue[] }` con al menos un problema de archivo (`field: "file"`): `fileIssueStatus` asigna 413 a `FILE_TOO_LARGE`, 415 a `UNSUPPORTED_MEDIA_TYPE` y 422 al resto (`NOT_A_ZIP`, `ZIP_CORRUPT`, `LEGACY_XLS_OR_ENCRYPTED`, `MACRO_ENABLED`, `TEMPLATE_FILE`, `NOT_XLSX`, `XLSB_UNSUPPORTED`, `ZIP_BOMB`, `ZIP_SIZE_MISMATCH`, `ZIP_TOO_MANY_ENTRIES`, `TOO_MANY_CELLS`, `PARSE_TIMEOUT`, `NO_SHEET_WITH_HEADERS`, `TOO_MANY_ROWS`, `TOO_MANY_COLUMNS`).
- **400** `AppErrorPayload` (`BAD_REQUEST` con cuerpo vacío; `VALIDATION_FAILED` con cabeceras mal formadas).
- Los rechazos de las guardas HTTP son `AppErrorPayload`, no `ImportResponse`.
- Guardas HTTP comunes verificadas en pruebas: 401 sin credenciales, 403 con origen cruzado, 413 (`PAYLOAD_TOO_LARGE`) por cuerpo grande, 415 por `Content-Type` y 421 por `Host` no permitido. El 429 por límite de tasa o concurrencia proviene de `withApiGuards` con los códigos `RATE_LIMITED` (límite por minuto) o `BUSY` (semáforo lleno).

`ImportIssue.label` es la forma corta sin número de fila; la interfaz antepone «Fila N: ».
