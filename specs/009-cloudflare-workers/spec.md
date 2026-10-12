# Feature Specification: Despliegue en Cloudflare Workers

**Feature Branch**: `009-cloudflare-workers` (rama de trabajo: `cloudflare-worker`)

**Created**: 2026-10-09

**Status**: Implemented (probado en local con `wrangler dev`; **sin publicar** en una cuenta real)

**Input**: «Hagamos un worker para correr el programa», para que las jefas puedan ver el proyecto completo funcionando.

## Contexto

La app es un Next.js 16 que hoy se despliega con Docker en Node 24. Cloudflare Pages no la soporta (usa `sharp`, `pdfkit` y lectura de fuentes desde disco), pero sí es posible ejecutarla como **Worker** con el adaptador OpenNext, cambiando solo lo que depende de Node: el almacenamiento, la carga de fuentes, la lectura de Excel y la verificación de QR existentes. **Docker/Node sigue siendo la referencia** y no cambia de comportamiento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver la herramienta funcionando en una URL de Cloudflare (Priority: P1)

Una persona con las credenciales abre el sitio, entra con usuario y contraseña, importa o escribe piezas, genera los QR, ajusta el diseño y descarga el PDF y el ZIP de SVG, igual que en Docker.

**Why this priority**: es el motivo de la funcionalidad: poder enseñar el proyecto completo.

**Independent Test**: `bun run cf:build && bun run cf:preview`, abrir `http://localhost:8787`, y recorrer Piezas → Diseño → Exportar.

**Acceptance Scenarios**:

1. **Given** el Worker con `AUTH_MODE=basic`, **When** se pide `/` sin credenciales, **Then** responde 401; con credenciales correctas responde 200.
2. **Given** dos piezas con Link del menú, **When** se llama a `POST /api/qr/resolve`, **Then** se crean 2 QR en R2 (`created: 2`); repetir la llamada da `reused`, no `created`.
3. **Given** los QR generados, **When** se pide `POST /api/export` con PDF y ZIP, **Then** el PDF es vectorial (0 imágenes), con la tinta `#000000`, y el ZIP trae un SVG por pieza.

---

### User Story 2 - Los QR y las fuentes viven en R2 (Priority: P1)

El Worker no tiene disco. Los QR generados se guardan en el bucket R2 `QR_BUCKET` y se sirven por `/api/storage/**`; la fuente de las piezas se carga desde el prefijo privado `fonts/` del mismo bucket.

**Why this priority**: sin esto no se puede generar ni exportar nada en Workers.

**Independent Test**: `bun run cf:fonts` sube la fuente al R2 local; `GET /api/storage/qr/v1/{sha256}.svg` devuelve el SVG; `GET /api/storage/fonts/...` y `/fonts/...` devuelven 404.

**Acceptance Scenarios**:

1. **Given** `STORAGE_PROVIDER=r2`, **When** 20 subidas simultáneas de la misma clave, **Then** una crea y 19 devuelven `exists` (contrato común de `StorageProvider`).
2. **Given** la fuente en `fonts/address-sans/…`, **When** se exporta o se pide la vista previa, **Then** las piezas se dibujan con Address Sans Pro Cd (no responde `FONTS_MISSING`).
3. **Given** cualquier ruta pública, **When** se pide la fuente de las piezas, **Then** responde 404: no es descargable.

---

### User Story 3 - Importar Excel en el Worker (Priority: P2)

El libro `.xlsx` se lee dentro de la propia petición, porque Workers no tiene hilos.

**Why this priority**: es el camino principal de carga masiva.

**Independent Test**: `POST /api/import/excel` con un libro de 3 filas (2 válidas y 1 sin mesa) da `valid: 2`, `withErrors: 1`.

**Acceptance Scenarios**:

1. **Given** un libro válido, **When** se importa en Workers, **Then** devuelve las mismas celdas crudas que el hilo de Node.
2. **Given** Node con hilos, **When** se importa, **Then** sigue usando el hilo aislado con límite de memoria (sin cambios).

---

### User Story 4 - Avisar con claridad lo que no está disponible (Priority: P2)

Verificar un QR existente (Link del QR) necesita `sharp`, que no existe en Workers.

**Why this priority**: la regla crítica del QR exige no generar nunca uno cuando hay Link del QR; si no se puede verificar debe quedar a la vista.

**Independent Test**: `src/server/qr/verify-existing.no-sharp.test.ts`.

**Acceptance Scenarios**:

1. **Given** `sharp` no disponible, **When** se verifica un QR existente, **Then** devuelve el error `unsupported-type` con un mensaje claro, no sube nada y no deja la pieza en «verificando».

### Edge Cases

- Un archivo que no es un libro llega al lector sin hilos: `guardXlsx` lo rechaza antes; SheetJS leería bytes arbitrarios como texto.
- El binding `QR_BUCKET` falta: `StorageError("unavailable")` con el nombre del binding.
- Primera petición tras un arranque en frío: las fuentes se cargan una vez desde R2 y quedan en memoria; si la carga falla se reintenta en la siguiente petición.
- Exportaciones muy grandes (hasta 5000 piezas): pueden superar los 30 s de CPU por defecto; `wrangler.jsonc` fija `limits.cpu_ms = 120000`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE poder compilarse con `opennextjs-cloudflare build` y ejecutarse con `wrangler dev` sin cambiar el comportamiento en Docker/Node.
- **FR-002**: `STORAGE_PROVIDER=r2` DEBE guardar y leer QR en el binding `QR_BUCKET`, con «crear solo si no existe» mediante `onlyIf.etagDoesNotMatch: "*"` y el mismo contrato que los demás proveedores.
- **FR-003**: `/api/storage/**` DEBE servir objetos con `local` y `r2`, y seguir devolviendo 404 con `s3`; solo sirve claves con forma de QR o instantánea.
- **FR-004**: Con `r2`, la fuente de las piezas DEBE cargarse desde `fonts/` del bucket y NO DEBE ser accesible públicamente.
- **FR-005**: La exportación y la vista previa DEBEN esperar a que las fuentes remotas estén en memoria antes de dibujar; con disco no esperan nada.
- **FR-006**: `pdfkit` NO DEBE cargar su fuente estándar por defecto (no existe en Workers); el texto usa la fuente de la plantilla o contornos.
- **FR-007**: La exportación DEBE ceder el turno con `setTimeout`, no con `node:timers/promises`.
- **FR-008**: La lectura de Excel DEBE usar el hilo de `worker_threads` en Node y la propia petición en Cloudflare Workers, compartiendo el mismo código de lectura (`parse-core.mjs`).
- **FR-009**: Sin `sharp`, verificar un QR existente DEBE fallar con un error visible y NUNCA generar ni guardar un QR.
- **FR-010**: `bun run cf:fonts` DEBE subir solo las fuentes que usa el servidor (`address-sans`) al R2 local o, con `--remote`, al real.

### Key Entities

- **Binding `QR_BUCKET`**: bucket R2 privado con dos prefijos: `qr/…` (QR y snapshots, servidos por la app) y `fonts/…` (fuentes, nunca servidas).
- **R2StorageProvider**: implementación de `StorageProvider` sobre el binding.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Contrato de `StorageProvider` pasa con R2 (`src/server/storage/storage.test.ts`), incluida la prueba de 20 subidas simultáneas.
- **SC-002**: En `wrangler dev` con R2 local: 300 QR se resuelven en ≈ 0.8 s y se exportan 300 piezas (50 páginas) en ≈ 2.2 s con texto vivo y ≈ 2.8 s en contornos. Son tiempos locales, no del servicio real.
- **SC-003**: El PDF del Worker tiene 0 imágenes, usa la fuente incrustada `AddressSansPro-CdSemibold` en texto vivo, y contornos sin fuentes en el otro modo; la tinta es `#000000`.
- **SC-004**: La importación de un libro de 3 filas da `valid: 2`, `withErrors: 1` (`src/server/excel/read-workbook.test.ts` cubre el camino sin hilos).
- **SC-005**: Los 929 tests, el lint y el typecheck de Node siguen pasando; `bun run build` compila.
- **SC-006**: El paquete pesa ≈ 4.3 MB comprimido (`wrangler deploy --dry-run`).

## Assumptions

- La cuenta de Cloudflare tiene el plan de pago de Workers (el paquete supera los 3 MB del plan gratuito).
- Quien publica tiene la licencia de Address Sans Pro Cd y de Gotham que cubra su uso en servidor (y Gotham en web).

## Pendientes (No verificado)

- **Despliegue real:** no se ha publicado; hacen falta `wrangler login`, crear el bucket y subir fuentes con `--remote`.
- **Límites de producción:** memoria (≈ 128 MB) y CPU por petición se probaron solo en local; `wrangler dev` no los aplica igual. Una exportación grande podría fallar en producción.
- **R2 real:** `onlyIf.etagDoesNotMatch: "*"` se verificó contra el R2 simulado de Wrangler, no contra el servicio.
- **Proxy de Next (`src/proxy.ts`):** OpenNext avisa que el middleware de Node en Cloudflare es experimental. El 401 sin credenciales se comprobó en local.
- **Verificar QR existentes** no está disponible en Workers. Opción futura: rasterizar con `resvg-wasm` en lugar de `sharp`.
- **Licencias:** subir Address Sans a Cloudflare es uso en servidor; falta la confirmación de compras o legal.
