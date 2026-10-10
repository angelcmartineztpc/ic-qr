# Feature Specification: Resolución de QR y storage

**Feature Branch**: `002-qr-resolucion-y-storage` (retrospectiva: se desarrolló en la rama `integracion-front-back`; Fase 5 del plan, commit `05f7991`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: Documentación retrospectiva de la regla crítica del QR, su máquina de estados, la verificación de QR existentes, el storage local y S3 y la descarga segura. Fuentes: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §B.2, §B.4, §S2, §S3 y «Notas de implementación de la Fase 5». Numeración propia: no confundir con `specs/F002-*.md` (generador de QR de la rama anterior, ver [`specs/README.md`](../README.md)).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un QR por menú, sin duplicados (Priority: P1)

Quien prepara piezas deja vacío el Link del QR y escribe solo el Link del menú. La herramienta genera el QR una vez, lo guarda en el storage y lo reutiliza siempre que el menú sea el mismo, aunque se reabra la app, se reimporte el Excel o se abran dos pestañas.

**Why this priority**: es el caso común y la base de la regla crítica. Un QR grabado en metal no se reimprime barato (constitución, principios II y III).

**Independent Test**: llamar a `POST /api/qr/resolve` dos veces con el mismo `menuUrl` sobre un storage local temporal. La primera crea `qr/v1/{sha256}.svg`; la segunda devuelve `reused` y no escribe nada.

**Acceptance Scenarios**:

1. **Given** un registro sin Link del QR, **When** se resuelve, **Then** el servidor sube un SVG a `[prefijo/]qr/v1/{sha256}.svg` y devuelve `qrUrl` derivado de la clave (`getPublicUrl`).
2. **Given** 50 registros con el mismo `menuUrl` en un lote, **When** se resuelve, **Then** se crea 1 archivo; la primera pieza es `generated` y las demás `reused`.
3. **Given** 20 llamadas simultáneas para el mismo QR, **When** terminan, **Then** hay exactamente 1 archivo creado.
4. **Given** un lote con un `menuUrl` inválido o demasiado largo, **When** se resuelve, **Then** solo ese ítem falla (`encode-failed`) y el resto del lote se procesa.

---

### User Story 2 - Con Link del QR nunca se genera (Priority: P1)

Si el usuario aporta un Link del QR, la herramienta usa exactamente ese recurso. Lo descarga, comprueba que es un SVG, lo sanea, lo decodifica y guarda una instantánea de su geometría. Si falla, muestra un error y bloquea; jamás genera un QR de respaldo.

**Why this priority**: es la regla NON-NEGOTIABLE de la constitución (principio II). Generar en su lugar imprimiría un QR que el cliente no aprobó.

**Independent Test**: enviar un ítem con `qrUrl` en `items` y comprobar `failed`/`unsafe-url` y 0 archivos `qr/v1/*.svg`; enviar el mismo `qrUrl` en `verify` y comprobar que solo se crea `qr/ext/v1/{assetSha256}.json`.

**Acceptance Scenarios**:

1. **Given** un SVG de nuestro propio storage, **When** se verifica, **Then** se lee sin red, se decodifica y se guarda solo la instantánea JSON.
2. **Given** un PNG, JPG o WebP, **When** se verifica, **Then** el error es `raster-only`; si es una página web, `not-an-image`; si es un PDF, `unsupported-type`.
3. **Given** un SVG con `<script>`, `href`, `style` con `url()`, DOCTYPE o entidades, **When** se verifica, **Then** se rechaza con `invalid-svg` en lugar de ignorar lo peligroso.
4. **Given** un SVG válido sin QR legible, **When** se verifica, **Then** el resultado es `existing-ok` con `verification: "undecodable"`: el usuario decide.
5. **Given** un `qrUrl` http, con IP privada o fuera de la lista blanca, **When** se verifica, **Then** falla con `unsafe-url` o `host-not-allowed` y no se genera nada.

---

### User Story 3 - Cambiar el menú deja el QR *stale* y bloquea (Priority: P1)

Si se edita el Link del menú de una pieza con QR generado, el QR queda desactualizado (*stale*). La exportación se bloquea hasta que el usuario elija regenerar o mantener el QR anterior. Esa confirmación está ligada al estado actual y caduca si algo vuelve a cambiar.

**Why this priority**: evita imprimir un QR que ya no apunta al menú vigente, sin generar QR nuevos por sorpresa.

**Independent Test**: `src/lib/records/qr-state.test.ts` y `tests/integration/qr-pipeline.test.ts` recorren editar menú, bloqueo, «mantener» y desbloqueo sin crear archivos.

**Acceptance Scenarios**:

1. **Given** un QR `generated` cuyo `payload` difiere de `menuUrl`, **When** se evalúa, **Then** la decisión es `blocked-stale` y el registro no es exportable.
2. **Given** un `qrAck` de tipo `stale` ligado a `menuUrl` y `payload`, **When** el usuario no edita más, **Then** el QR se reutiliza; si vuelve a editar el menú, el ack deja de valer.
3. **Given** un QR existente decodificado cuyo contenido difiere del `menuUrl`, **When** se evalúa, **Then** bloquea (`existing-mismatch`) salvo ack `mismatch`; el desajuste se deriva, no se guarda.

---

### User Story 4 - El servidor no confía en el cliente (Priority: P1)

Al exportar, el servidor recalcula la identidad de cada QR y dibuja solo lo que está en el storage. La exportación no crea QR, no escribe y no sale a la red.

**Why this priority**: un IndexedDB corrupto o un `.qrproj.json` editado a mano no puede imprimir un QR distinto del archivo al que apunta la pieza.

**Independent Test**: `src/server/qr/identity.test.ts` manipula clave, hash, payload y link, y comprueba `QrIdentityError`; verifica además que materializar no llama a `upload`.

**Acceptance Scenarios**:

1. **Given** un registro `generated` con `storageKey` o `contentHash` alterados, **When** se verifica la identidad, **Then** se lanza `QR_IDENTITY_MISMATCH` con el `recordId`.
2. **Given** un registro `generated` íntegro, **When** se materializa, **Then** se re-codifica el payload y el SVG coincide byte a byte con `svgSha256`; si el renderer cambió, se usa el archivo almacenado y se avisa en el log.
3. **Given** un QR existente cuya instantánea falta, está dañada o es de otro `assetSha256`, **When** se materializa, **Then** falla con `QR_UNRESOLVED`; nunca se inventa un QR.

---

### User Story 5 - Storage intercambiable y seguro (Priority: P2)

Operaciones elige dónde viven los QR: disco local (desarrollo o una réplica) o un bucket S3-compatible (AWS, Cloudflare R2, Supabase, MinIO). El resto del sistema no cambia.

**Why this priority**: producción necesita URL públicas portables; el disco local no lo permite fuera de desarrollo.

**Independent Test**: `src/server/storage/storage.test.ts` ejecuta el mismo contrato de `StorageProvider` contra disco y contra el SDK real de AWS apuntando a un servidor falso (`tests/helpers/fake-s3-server.ts`).

**Acceptance Scenarios**:

1. **Given** 20 subidas simultáneas de la misma clave, **When** terminan, **Then** hay 1 `created` y 19 `exists` y nunca se sobrescribe.
2. **Given** un proveedor sin PUT condicional (Supabase), **When** se sube, **Then** se hace `HEAD` primero y no se pisa un objeto ajeno.
3. **Given** un objeto ajeno en la clave del QR (otro contenido o sin metadatos), **When** se resuelve, **Then** el resultado es `storage-conflict`: ni se reutiliza ni se sobrescribe.
4. **Given** `STORAGE_PROVIDER=local`, **When** se pide `GET /api/storage/qr/v1/{sha256}.svg`, **Then** se sirve sin autenticación con cabeceras inmutables y CSP `sandbox`; con `s3` la ruta responde 404.

---

### User Story 6 - Descarga externa sin SSRF y cuota de escritura (Priority: P2)

Un Link del QR externo solo se descarga por https:443 hacia IP públicas, con redirecciones revalidadas y límites. Los QR nuevos por hora están acotados.

**Why this priority**: es la única salida a Internet del servidor y el único camino de escritura masiva al bucket.

**Independent Test**: `src/server/net/safe-fetch.test.ts` (matriz SSRF con DNS y transporte falsos) y `src/server/qr/resolve.test.ts` (cuota).

**Acceptance Scenarios**:

1. **Given** un nombre que resuelve a varias IP y una es privada, **When** se descarga, **Then** se bloquea (`unsafe-url`).
2. **Given** una redirección hacia `169.254.169.254` o hacia http, **When** se sigue, **Then** se bloquea al revalidar el destino.
3. **Given** superada la cuota horaria, **When** llega un menú nuevo, **Then** el ítem falla con `quota-exceeded`; los QR que ya existen se siguen reutilizando.

### Edge Cases

- Ítem de `items` con `qrUrl` o `qr`: `failed`/`unsafe-url`, sin generar (defensa en profundidad).
- Registro inconsistente `qr.source = "none"` con `qrUrl`: la decisión es `check-existing`, nunca `generate`.
- El usuario edita `menuUrl` o teclea un `qrUrl` mientras una petición está en vuelo: `canApplyResolution` descarta el resultado y no se pisa lo tecleado.
- `PUT` condicional con 409: se reintenta una vez; 412 se confirma con `HEAD` y el metadato `svg-sha256`.
- Objeto borrado entre el 412 y el `HEAD`: un segundo intento; si persiste, `storage-failed`.
- Clave con `../`, extensión distinta o prefijo con varios segmentos: se rechaza antes de tocar el storage.
- SVG por trazos (sin relleno): se acepta y se marca `strokeBased` (aviso para CAM).
- Proxy de salida definido (`HTTP_PROXY`, `HTTPS_PROXY`, `NODE_USE_ENV_PROXY`): la IP fijada no funcionaría; el arranque falla salvo `QR_FETCH_DIRECT_EGRESS_CONFIRMED=true`.
- El `payload` del menú supera 1273 caracteres (`MAX_PAYLOAD_LENGTH`): `encode-failed`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE no generar nunca un QR para un registro con Link del QR; DEBE verificar ese recurso (§B.2, §S2).
- **FR-002**: El sistema DEBE derivar la clave del archivo de `sha256` de `{v, payload, ecc: "high", margin: 4, dark, light, renderer}` como `[prefijo/]qr/v1/{sha256}.svg`, de modo que el mismo contenido caiga siempre en el mismo archivo.
- **FR-003**: `POST /api/qr/resolve` DEBE rechazar con `unsafe-url` cualquier ítem de generación con `qrUrl` o `qr`, y DEBE aceptar solo `recordId`, `menuUrl` y `expectedRevision` (`z.strictObject`).
- **FR-004**: El sistema DEBE calcular `qrUrl` en el servidor con `getPublicUrl(key)`; el cliente no lo aporta.
- **FR-005**: El sistema DEBE tratar como `stale` un QR generado cuyo `payload` difiere de `menuUrl` y DEBE bloquear la exportación salvo un `qrAck` válido ligado a `menuUrl` y `payload`/`assetSha256`.
- **FR-006**: El cliente DEBE aplicar una resolución solo si `canApplyResolution` lo permite; si no, DEBE descartarla y re-derivar el estado.
- **FR-007**: El servidor DEBE decidir el tipo de recurso por sus bytes (SVG, raster, PDF, HTML, desconocido), no por extensión ni `Content-Type`.
- **FR-008**: El saneado de SVG externo DEBE usar lista blanca (`svg`, `g`, `path`, `rect`, `polygon`) y DEBE rechazar atributos `on*`, `href`, `url()`, DOCTYPE, entidades e instrucciones de proceso, y SVG mayores de 512 KiB, con más de 200 000 números, con dimensiones mayores de 20 000 o con más de 5000 nodos.
- **FR-009**: La decodificación DEBE rasterizar solo el SVG re-emitido por el servidor (1024 px, `limitInputPixels` 4 194 304, 3 s) y nunca el original.
- **FR-010**: Para un QR existente DEBE guardarse la instantánea `qr/ext/v1/{assetSha256}.json` con `PUT` condicional, y la exportación DEBE imprimir esa instantánea sin salir a la red.
- **FR-011**: La exportación DEBE ejecutar `verifyQrIdentity` y `materializeQrGeometry` sin escribir en el storage; cualquier fallo es un error por pieza con `recordId` y sin QR de respaldo.
- **FR-012**: `safeFetch` DEBE exigir https y puerto 443, sin credenciales en la URL, política `public` o `allowlist`, todas las IP resueltas públicas, IP fijada en la conexión, máximo 3 redirecciones revalidadas, `QR_FETCH_TIMEOUT_MS` y `QR_FETCH_MAX_BYTES`.
- **FR-013**: Una clave de storage DEBE cumplir `KEY_PATTERN` antes de cada operación; `keyFromPublicUrl` DEBE resolver las URL propias sin red.
- **FR-014**: El proveedor S3 DEBE no enviar ACL, desactivar el logger del SDK, usar checksums `WHEN_REQUIRED` y soportar PUT condicional según `STORAGE_CONDITIONAL_PUT` (`auto` = desactivado si el endpoint contiene `supabase.co`).
- **FR-015**: Ante un objeto existente con distinto `x-amz-meta-svg-sha256`, el sistema DEBE devolver `storage-conflict` sin reutilizar ni sobrescribir.
- **FR-016**: El sistema DEBE limitar los QR nuevos a `QR_MAX_NEW_OBJECTS_PER_HOUR` (2000 por defecto) en una ventana de una hora; los reutilizados no cuentan.
- **FR-017**: `GET /api/storage/[...key]` DEBE responder 404 si `STORAGE_PROVIDER` no es `local` o la clave no es válida, y DEBE servir con `nosniff`, `Cache-Control` inmutable y `Content-Security-Policy` con `sandbox`.
- **FR-018**: `GET /api/qr/asset` DEBE aceptar solo claves de instantánea (`qr/ext/v{n}/{sha256}.json`) y devolver la geometría validada con `Cache-Control: private, max-age=3600`.
- **FR-019**: El sistema DEBE usar los códigos de error de QR de `QrErrorCodeSchema` y mensajes en español.

### Key Entities

Detalle en [`data-model.md`](data-model.md).

- **QRRecord.qr (`QrSourceInfo`)**: `none`, `generated` o `existing`, con claves, huellas y estado de verificación.
- **QrAck**: confirmación del usuario (`stale`, `mismatch`, `undecodable`) ligada a `menuUrl` y huella del QR.
- **QrResolution**: resultado por pieza (`generated`, `reused`, `existing-ok`, `failed`).
- **StorageProvider**: contrato de storage (`local` o `s3`) con capacidades.
- **ExternalSnapshot**: geometría saneada de un QR existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con Link del QR se generan 0 QR: el ítem con `qrUrl` da `failed` y el flujo con `qrUrl` crea 0 archivos `qr/v1/*.svg` (`src/server/qr/resolve.test.ts`, `tests/integration/api-qr.test.ts`, `tests/integration/qr-pipeline.test.ts`).
- **SC-002**: 20 resoluciones simultáneas del mismo menú crean exactamente 1 archivo, y 50 piezas con el mismo menú comparten 1 (`src/server/qr/resolve.test.ts`).
- **SC-003**: 20 subidas concurrentes de la misma clave dan 1 `created` y 19 `exists`, en disco y en S3 simulado (`src/server/storage/storage.test.ts`).
- **SC-004**: La tabla de decisión de `resolveQrDecision` (generar, reutilizar, stale, existente, mismatch, undecodable, acks que caducan) está cubierta (`src/lib/records/qr-state.test.ts`).
- **SC-005**: La matriz SSRF (IP privadas, IPv4 mapeada, NAT64, 6to4, metadatos, rebinding, redirecciones, límites, allowlist) pasa sin red (`src/server/net/safe-fetch.test.ts`).
- **SC-006**: Los SVG hostiles se rechazan y la salida es solo geometría (`src/server/qr/sanitize-svg.test.ts`).
- **SC-007**: Manipular clave, hash, payload o link de un QR genera `QrIdentityError`, y materializar no escribe ni usa la red (`src/server/qr/identity.test.ts`).
- **SC-008**: Las rutas responden con sus guardas (401, 415, 403, 421, 400, 404) con storage local temporal (`tests/integration/api-qr.test.ts`).
- **SC-009**: Cuota superada: los QR nuevos fallan con `quota-exceeded` y los existentes se reutilizan; la ventana se renueva cada hora (`src/server/qr/resolve.test.ts`).
- **SC-010**: `bun run test` pasa completo (917 tests al cierre de esta documentación, según el responsable; no se reejecutó al redactar).

## Assumptions

- MVP de una réplica: cuota, limitadores y cachés están en memoria (§S3, «Topología»).
- Los QR codifican el link estable `{dominio}/api/qr/{resortCode}/{service}` (ver [`specs/F004-stable-redirect.md`](../F004-stable-redirect.md)); esta feature trata el `menuUrl` como texto ya validado por `MenuUrlSchema`.
- La UI (badges, diálogo de exportación, botones Regenerar/Mantener/Reintentar) vive en otras features; aquí solo se documentan las funciones puras y los endpoints.
- El comportamiento contra Cloudflare R2 y Supabase reales no se ha verificado; la arquitectura lo deja como prueba opcional de la Fase 11.
- El catálogo en PostgreSQL (`qr_codes`) es futuro; hoy `StorageBackedCatalog` consulta el storage.

## Pendientes

- **No verificado**: PUT condicional y metadatos contra R2 y Supabase reales (§S3, Fase 5).
- **No verificado en código**: la detección `QR_ASSET_CHANGED` al re-verificar y la caché LRU por `qrUrl` + `ETag` que describe §S2.4; no hay referencias en `src/server/qr` (solo el código `asset-changed` en `src/schemas/record.ts` y su mensaje).
- **No verificado en código**: `EXPORT_VERIFY_EXISTS` (§S2.5) no existe en `env-schema.ts`.
- Pruebas de rendimiento citadas en §S2 (≈25 s por 1000 QR nuevos) no están automatizadas.
