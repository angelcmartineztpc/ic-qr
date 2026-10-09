# Data Model: Importación de Excel y CSV

Esquemas Zod en `src/schemas/import.ts`; tipos inferidos en `src/types/import.ts`. Contrato original en [`docs/ARCHITECTURE.md` §C.2](../../docs/ARCHITECTURE.md) y §S1.

## ImportResult (`ImportResultSchema`)

| Campo | Contenido |
|---|---|
| `fileName`, `sheetName` | hasta 255 caracteres; el CSV usa la hoja `CSV` |
| `headerRow` | fila de cabecera (1-based, fila real de Excel) |
| `mapping` | `ColumnMapping[]`: `column` (letras A–ZZZ), `header`, `field` o `null`, `match` (`exact`, `fuzzy`, `manual`, `ambiguous`, `none`), `candidates` |
| `missingColumns` | campos obligatorios sin columna (Área, Mesa, Link del menú, salvo link común) |
| `totalRows` | filas de datos no vacías procesadas (0 si hace falta mapeo) |
| `successful` | `ImportedRow[]` válidas y no duplicadas dentro del archivo |
| `rejected` | `RejectedRow[]` con `raw`, `extra` e `issues` (al menos una) |
| `errors`, `warnings` | `ImportIssue[]`; los duplicados del archivo son siempre avisos |
| `duplicates` | `DuplicateGroup[]` con `scope: "file"`; `rows[0]` es la original |
| `duplicateRows` | `ImportedRow[]` que duplican a otra del archivo |
| `stats` | `valid`, `withErrors`, `duplicates`, `emptyRowsSkipped`, `truncatedTo?` |

Invariante: toda fila no vacía está en `successful`, `rejected` o `duplicateRows`. El cliente recalcula los duplicados con la clave del proyecto y contra las piezas existentes (`ImportDisplayStats`: `totalRows = valid + withErrors + duplicates`).

## ImportedRow y RejectedRow

- **ImportedRow**: `row`, `draft` (seis campos más `qrUrl?`), `extra` (columnas no mapeadas, valores ≤ 2048), `issues`, `duplicateKey`.
- **RejectedRow**: `row`, `raw` (valores originales por campo), `extra`, `issues` con al menos una.

## ImportIssue

`row` (o `null` para archivo y columna), `column?`, `field` (campos, `file`, `column` o `record`), `value` (≤ 200 caracteres), `label`, `message`, `severity` (`error`, `warning`, `info`), `code` y `relatedRow?`. Códigos en `IMPORT_ISSUE_CODES`, agrupados en archivo, columnas, filas y celdas, y duplicados.

## Estrategias y decisiones

- `DuplicateStrategy`: `keep`, `remove`, `review`. `DuplicateDecision`: `keep` o `discard` por fila.
- `DuplicateKeyConfig` y `DEFAULT_DUPLICATE_KEY`: ver [`specs/001-registros-y-validacion/data-model.md`](../001-registros-y-validacion/data-model.md).
- `applyDuplicateStrategy` devuelve `{toCreate, discarded}`; en `review`, sin decisión se descarta.

## ImportSession (solo sesión, `src/lib/state/stores.ts`)

`status` (`idle`, `uploading`, `review`, `done`, `error`), `result`, `strategy` (por defecto `keep`), `decisions`, `mode` (`append` por defecto o `replace`), `includeRejected` (por defecto `false`), `outcome`, `error` (`message`, `issues`, `canTruncate`).

## Persistencia

Clave IndexedDB `last-import` (`src/lib/state/last-import.ts`): `{result, outcome}` con `outcome = {created, discarded, fixes, discardedRows}`. Se valida al leer y, si no se entiende, se ignora.

## Reglas de campo en la importación

Cada fila pasa por `validateDraft` (reglas de la spec 001). Un Link del QR con credenciales rechaza la fila; con puerto distinto de 443 o host no permitido genera los avisos `QR_URL_UNSAFE` o `QR_URL_HOST_NOT_ALLOWED` y la pieza se crea con `qrError`.
