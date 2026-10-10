# Data Model: Registros de piezas y validación

Fuente de verdad: Zod en `src/schemas/record.ts` y `src/schemas/project.ts`; los tipos de `src/types/record.ts` y `src/types/project.ts` se infieren de ellos (`z.output`). Contrato de dominio original en [`docs/ARCHITECTURE.md` §C.1 y §C.2](../../docs/ARCHITECTURE.md).

## QRRecord (`StoredRecordSchema`, esquema tolerante)

| Campo | Tipo | Regla en el esquema tolerante | Regla estricta (`FIELD_RULES`) |
|---|---|---|---|
| `id` | string | 1–64 caracteres; debe coincidir con su clave en `recordsById` | n/a |
| `area` | string | ≤ 2048 | obligatorio, ≤ 120 |
| `estacion` | string | ≤ 2048 | opcional, ≤ 120 |
| `mesa` | string | ≤ 2048 | obligatorio, ≤ 40 |
| `subgrupo` | string | ≤ 2048 | opcional, ≤ 120 |
| `concepto` | string | ≤ 2048 | opcional, ≤ 120 |
| `menuUrl` | string | ≤ 4096 | obligatorio, URL http(s) segura, forma canónica WHATWG |
| `qrUrl` | string opcional | ≤ 4096 | opcional, https, URL segura (`ExistingQrUrlSchema`) |
| `qrStatus` | `pending`, `generating`, `existing`, `generated`, `stale`, `error` | enum | derivado (`deriveQrStatus`) |
| `qr` | unión por `source`: `none`, `generated`, `existing` | `strictObject` por variante | invariantes de §C.3 |
| `qrError` | `{code, message}` opcional | `code` ∈ `QrErrorCodeSchema` | n/a |
| `qrAck` | `{kind, menuUrl, qrFingerprint, at}` opcional | `kind` ∈ `stale`, `mismatch`, `undecodable` | válido solo si coincide con `menuUrl` y la huella actual (`ackValid`) |
| `order` | entero ≥ 0 | | se materializa desde `ProjectState.order` en las fronteras |
| `validationErrors` | `ValidationIssue[]` | | recalculado por `validateRecord` |
| `metadata` | `origin` (`manual`, `excel`, `duplicate`, `project-file`), `sourceFile`, `sourceRow`, `extra`, `duplicateOf` | `strictObject` | n/a |
| `createdAt`, `updatedAt` | ISO 8601 con desfase | | n/a |

Todos los objetos son `strictObject`: un campo desconocido invalida el registro y lo lleva a cuarentena.

`normalizeText` (`src/lib/text/normalize.ts`) se aplica a los cinco campos de texto: NFC, controles a espacio, caracteres de formato eliminados salvo ZWJ, espacios colapsados y recorte.

## Obligatoriedad

| Campo | Formulario | Mensaje corto si falta o es inválido |
|---|---|---|
| Área | obligatorio | Área vacía |
| Estación | opcional | n/a |
| Mesa | obligatorio | Mesa vacía |
| Sub-grupo | opcional | n/a |
| Concepto | opcional | n/a |
| Link del menú | obligatorio | Falta Link del menú / Link del menú inválido |
| Link del QR | opcional | Link del QR inválido |

Un texto que supera su máximo produce «{Campo} demasiado largo» (`TOO_LONG`). `http://` en el Link del menú es el aviso `HTTP_URL`, no un error.

## Entidades derivadas

- **RecordDraft** (`RecordDraftSchema`): los seis campos enlazables más `qrUrl` opcional, con reglas estrictas.
- **ValidationIssue**: `{field, code, message, severity}`; `field` ∈ campos o `record` (invariantes como «Hay un Link del QR sin QR asociado»).
- **QuarantineEntry**: `{raw, reason ≤ 2000, at}`.
- **PersistedProject** (`PersistedProjectSchema`, `PROJECT_SCHEMA_VERSION = 2`): `projectId`, `name ≤ 200`, `recordsById` (valores `unknown`, se validan uno a uno al hidratar), `order`, `quarantine`, `templateId`, `templateOverrides`, `layout`, `exportOptions`, `fileNameTouched`, `duplicateKey`, `revision`, `savedRevision`, `lastLocalSaveAt`.
- **ProjectFile** (`ProjectFileSchema`): `{format: "qr-production-project", schemaVersion: 2, exportedAt, project}`; máximo 20 MB (`PROJECT_FILE_MAX_BYTES`).
- **DuplicateKeyConfig**: `{fields, caseInsensitive, canonicalUrl}`; por defecto `area`, `estacion`, `mesa`, `subgrupo`, `concepto`, `menuUrl`, sin distinguir mayúsculas y con URL canónica (`DEFAULT_DUPLICATE_KEY`, `src/schemas/import.ts`).

## Estado de sesión (no persistido)

`SessionState` en `src/lib/state/stores.ts`: `hydrated`, `writer` (`owner` o `read-only`), `persistence.status` (`ok`, `saving`, `error`, `unavailable`), `selection` (`currentId`, `page`, `pageSize` = 24, `view` = `pages` o `grid`), `filter` (`all`, `errors`, `withQr`, `needQr`, `excluded`), `query`, `excluded`, `confirmDeletes`, `lastDeleted`, `inFlight`, `notices`.

## Transiciones y reglas

- `createRecord`: con `qrUrl` → `qr = existing/unchecked`; sin él → `qr = none` (pendiente).
- `updateRecordData`: un QR generado se conserva si cambia el Link del menú (queda `stale`); escribir otro Link del QR lo convierte en existente sin verificar; vaciar el Link del QR de un existente lo vuelve pendiente; un `qrAck` que ya no corresponde se elimina.
- `duplicateRecord`: copia datos y QR, descarta el `qrAck`, fija `metadata = {origin: "duplicate", duplicateOf}`.
- `hydrateRecords`: valida cada registro; `withDerived` re-deriva estado y errores; `generating` no se restaura.
- `stripAcks`: al abrir un `.qrproj.json` elimina todos los `qrAck` y devuelve los ids afectados.
- Invariante de orden: `isPermutation(order, keys(recordsById))`; `repairOrder` lo restablece.
