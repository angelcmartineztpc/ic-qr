# Data Model: Resolución de QR y storage

Fuentes: `src/schemas/record.ts`, `src/schemas/api.ts`, `src/schemas/qr-geometry.ts`, `src/types/storage.ts`, `src/lib/qr/hash-input.ts`.

## QrSourceInfo (`QRRecord.qr`)

Unión discriminada por `source`.

| `source` | Campos | Notas |
|---|---|---|
| `none` | ninguno | Sin QR; solo este estado puede generar. |
| `generated` | `storageKey` (`[prefijo/]qr/v{n}/{64 hex}.svg`), `payload` (1–2048), `contentHash`, `svgSha256`, `rendererVersion`, `generatedAt` | `qrUrl` del registro se deriva de `storageKey`. |
| `existing` | `assetKind` (`unknown`, `svg`, `raster`), `verification` (`unchecked`, `decoded`, `undecodable`), opcionales `assetSha256`, `snapshotKey` (`[prefijo/]qr/ext/v{n}/{64 hex}.json`), `decodedPayload` (≤4096), `strokeBased`, `checkedAt` | El desajuste con `menuUrl` no se guarda: se deriva de `decodedPayload !== menuUrl`. |

## QrAck

`{ kind: "stale" | "mismatch" | "undecodable", menuUrl, qrFingerprint, at }`. Es válido solo si `menuUrl` coincide y `qrFingerprint` es el `payload` (generado) o el `assetSha256` (existente). `makeAck` lo construye; `ackValid` lo comprueba.

## QrStatus y decisiones

- `QrStatus` visible: `pending`, `generating`, `generated`, `stale`, `existing`, `error`. `generating` solo existe en sesión y solo para `source: none` sin `qrUrl`.
- `QrDecision`: `generate`, `reuse-generated`, `check-existing`, `blocked-stale`, `blocked-existing`, `none`.
- `QrBlocker`: `pending`, `error`, `unverified`, `stale`, `existing-mismatch`, `existing-undecodable`.
- Invariante: `isExportable` ⇔ sin errores de validación bloqueantes y `qrBlocker === null`.

Transiciones (docs §B.4): `pending → generating → generated | error`; `generated → stale` al editar `menuUrl`; `stale → generating` al regenerar; `stale → stale` con ack (sigue siendo stale, pero exportable); `existing → error` ante fallos de verificación.

## QrResolution (respuesta por pieza)

Unión por `outcome`:

- `generated` o `reused`: `recordId`, `qrUrl`, `qr` (fuente `generated`).
- `existing-ok`: `recordId`, `qr` (fuente `existing`).
- `failed`: `recordId`, `error: { code, message }`.

## Códigos de error de QR (`QrErrorCodeSchema`)

`unreachable`, `timeout`, `not-an-image`, `too-large`, `unsafe-url`, `host-not-allowed`, `unsupported-type`, `raster-only`, `invalid-svg`, `undecodable`, `storage-failed`, `encode-failed`, `asset-changed`, `identity-mismatch`, `storage-conflict`, `quota-exceeded`.

Los de `safeFetch` (`SafeFetchError.code`): `unsafe-url`, `host-not-allowed`, `timeout`, `unreachable`, `too-large`. Los de storage (`StorageErrorCode`): `unavailable`, `forbidden`, `conflict`, `invalid-key`, `quota`, `unknown`.

## ExternalSnapshot (`qr/ext/v1/{assetSha256}.json`)

`{ v: 1, assetSha256, geometry: { viewBox: [x, y, w, h], nodes: ExternalNode[] (≤5000), strokeBased } }`. Un nodo es `path` (`d` ≤500 000 caracteres con `PATH_DATA`, `fill`, `fillRule`, `stroke?`, `strokeWidth?`, `transform?`) o `rect`.

## Claves y hash de contenido

- `hashInput(payload)` = `JSON.stringify({ v: 1, payload, ecc: "high", margin: 4, dark: "#000000", light: "#FFFFFF", renderer: QR_RENDERER_VERSION })`.
- `contentHash = sha256(hashInput)`; clave `qrStorageKey(contentHash, prefijo)` = `[prefijo/]qr/v1/{contentHash}.svg`.
- `externalSnapshotKey(assetSha256, prefijo)` = `[prefijo/]qr/ext/v1/{assetSha256}.json`.
- `KEY_PATTERN`: `^(?:[a-z0-9][a-z0-9-]*\/)?qr\/(?:v\d+\/[0-9a-f]{64}\.svg|ext\/v\d+\/[0-9a-f]{64}\.json)$`.

## StorageProvider

`id` (`local` | `s3`), `capabilities { conditionalPut, publicRead }`, `upload(key, body, PutOptions) → created | exists`, `get`, `head` (metadatos en minúsculas), `exists`, `delete`, `getPublicUrl` y `keyFromPublicUrl` (puras, sin red). `limitStorage` envuelve las operaciones de red/disco con `AsyncLimiter(STORAGE_MAX_CONCURRENCY)`.

| Proveedor | Configuración | PUT condicional |
|---|---|---|
| Disco local | `STORAGE_LOCAL_DIR` | Sí (`link` atómico) |
| AWS S3, R2, MinIO | `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_FORCE_PATH_STYLE` | Sí (según `STORAGE_CONDITIONAL_PUT`) |
| Supabase | endpoint con `supabase.co` | No en `auto`: `HEAD` y luego `PUT` |

## Cuota

`HourlyQuota(limit)`: ventana de 3 600 000 ms en memoria; `canCreate()`, `consume()` y `remaining`. Solo cuentan objetos creados.
