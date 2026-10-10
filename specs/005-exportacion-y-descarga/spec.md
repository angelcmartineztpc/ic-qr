# Feature Specification: Exportación y descarga

**Feature Branch**: `005-exportacion-y-descarga` (retrospectiva; se desarrolló en la rama `integracion-front-back`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: Documentación retrospectiva de la exportación del proyecto: `POST /api/export` (stream binario de tramas), opciones del PDF, ZIP de SVG, nombre de archivo, texto vivo por defecto (cambio del 2026-10-09), compatibilidad con Illustrator, descarga con progreso y cancelación, visor del PDF y descarga del SVG de una pieza. Referencias: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §A.5 (endpoints y guardas), §A.6 (pipeline), §S5 (descarga), §E.9 (ZIP), «Notas de implementación de las Fases 9 y 10», «Notas del visor del PDF»; [`docs/ILLUSTRATOR.md`](../../docs/ILLUSTRATOR.md). Las piezas que se dibujan están en la spec [004](../004-piezas-vectoriales-y-plantillas/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Descargar el PDF con progreso (Priority: P1)

Quien produce pulsa «Descargar PDF» en el paso Exportar y recibe un PDF vectorial con todas las piezas, viendo el progreso real de cada fase.

**Why this priority**: es el entregable final del proyecto (AC25, AC29–AC32).

**Independent Test**: `tests/integration/export.test.ts` llama a la ruta real y decodifica las tramas; `tests/e2e/export.spec.ts` descarga el archivo desde la interfaz.

**Acceptance Scenarios**:

1. **Given** un proyecto con piezas exportables, **When** se pulsa «Descargar PDF», **Then** el cliente muestra «Generando PDF…» (piezas hechas / total), «Preparando descarga…» y «Descargando…» (MB), y entrega `<nombre>.pdf`.
2. **Given** la descarga completa, **When** termina, **Then** aparece «PDF descargado correctamente» y el proyecto se marca como guardado (`savedRevision`).
3. **Given** piezas con QR pendiente, **When** se pulsa descargar, **Then** primero se resuelven en lote («Preparando los QR…») y después se exporta.
4. **Given** el stream del servidor, **When** se decodifica, **Then** trae progreso, `FILE_META`, `FILE_CHUNK`, y `DONE`.

---

### User Story 2 - Elegir el formato del PDF (Priority: P1)

Quien produce ajusta página, orientación, márgenes, separación, sangrado, centrado, una pieza por página o varias por hoja, texto vivo o contornos y el fondo blanco bajo el QR, y ve en vivo cuántas piezas caben.

**Why this priority**: la misma pieza se usa para imprimir hojas y para fabricar una a una.

**Independent Test**: `src/components/editor/ExportScreen.test.tsx` y `src/server/pdf/pdf.integration.test.ts`.

**Acceptance Scenarios**:

1. **Given** A4 vertical con los valores por defecto, **When** se muestra el panel, **Then** dice «6 por página · N páginas» (por ejemplo, 167 páginas para 1000 piezas).
2. **Given** «Una pieza por página», **When** se exporta, **Then** cada página mide la pieza (más 2 × sangrado) y el panel dice «N páginas, una pieza por página (70 × 70 mm)».
3. **Given** una página o márgenes donde la pieza no cabe, **When** se calcula la rejilla, **Then** el panel muestra el error `TILE_DOES_NOT_FIT` en rojo y el visor no se dibuja.
4. **Given** el valor por defecto, **When** se abre el panel, **Then** «Texto en el PDF» es «Texto vivo (editable en Illustrator)»; «Convertido a contornos (para fabricación)» queda disponible.

---

### User Story 3 - Texto vivo por defecto y compatibilidad con Illustrator (Priority: P1)

El equipo de diseño necesita abrir el PDF en Illustrator y poder editar el texto; fabricación puede pedir contornos.

**Why this priority**: cambio del 2026-10-09 (commit `3055c2e`) para que el archivo sea editable.

**Independent Test**: `tests/integration/export.test.ts`, «con los valores por defecto el texto es vivo». La apertura real en Illustrator es manual y no está hecha (ver Pendientes).

**Acceptance Scenarios**:

1. **Given** un proyecto nuevo, **When** se exporta sin tocar opciones, **Then** el PDF trae operadores `BT`, la fuente incrustada y 0 imágenes, y el SVG del ZIP trae `<text font-family="Address Sans Pro Cd">`.
2. **Given** «Convertido a contornos», **When** se exporta, **Then** el PDF no contiene fuentes ni operadores de texto.
3. **Given** el PDF, **When** se abre en Illustrator con `Archivo ▸ Abrir`, **Then** se obtienen trazados y texto sueltos en una capa (sin capas con nombre); con `Colocar` quedaría como objeto vinculado. Para capas con nombre se usa el SVG.

---

### User Story 4 - ZIP de SVG numerado (Priority: P2)

Quien necesita capas y nombres por objeto descarga también un ZIP con un SVG por pieza.

**Why this priority**: es el único camino a capas con nombre en Illustrator (el PDF no las trae).

**Independent Test**: `tests/integration/export.test.ts` (ZIP `001…`) y `tests/e2e/export.spec.ts` («con ZIP»).

**Acceptance Scenarios**:

1. **Given** «También un ZIP con un SVG por pieza», **When** se exporta, **Then** el PDF se descarga solo y el ZIP queda ofrecido como «Descargar ZIP» (en el aviso y en «Última exportación»).
2. **Given** 3 piezas, **When** se abre el ZIP, **Then** contiene `001.svg`, `002.svg`, `003.svg`; con «001-area-mesa.svg…» el nombre añade área y mesa saneados.
3. **Given** piezas excluidas, **When** se exporta, **Then** la numeración es 1…n sobre las piezas enviadas.
4. **Given** solo ZIP en el esquema (`formats: ["svgZip"]`), **When** se entrega, **Then** el ZIP se descarga directamente.

---

### User Story 5 - Cancelar y recuperarse de fallos (Priority: P2)

Quien descarga puede cancelar en cualquier fase; si el stream se corta o falla el servidor, entiende qué pasó y puede reintentar.

**Why this priority**: AC31 y AC32; una exportación de 1000 piezas dura segundos y no debe dejar nada a medias.

**Independent Test**: `src/components/editor/export-actions.test.ts` («errores y cancelación»), `src/lib/export/client.test.ts` y `tests/e2e/export.spec.ts` («cancelar, cortes y errores»).

**Acceptance Scenarios**:

1. **Given** una generación en curso, **When** se pulsa «Cancelar», **Then** se aborta la petición, aparece «Descarga cancelada» y no se descarga nada; el servidor detiene el bucle y libera su cupo.
2. **Given** un stream que termina sin `DONE` ni `ERROR`, **When** el cliente lo detecta, **Then** muestra «La descarga se interrumpió» con [Reintentar].
3. **Given** sin conexión, **When** se pulsa descargar, **Then** el mensaje es «No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.» con [Reintentar].
4. **Given** una generación activa, **When** la persona intenta cerrar o recargar la pestaña, **Then** el navegador pide confirmación (`beforeunload`).

---

### User Story 6 - Piezas bloqueadas, exclusión y solapes (Priority: P2)

Si alguna pieza no se puede exportar, nunca se exporta a medias: se lista con su motivo y se puede corregir o excluir.

**Why this priority**: Constitución II (los fallos son por pieza) y §1.2-22.

**Independent Test**: `export-actions.test.ts` («QR pendientes y bloqueos») y `tests/integration/export.test.ts` (400 con `recordId`).

**Acceptance Scenarios**:

1. **Given** piezas con error o QR sin resolver, **When** se pulsa descargar, **Then** un diálogo lista cada pieza con su motivo y ofrece «Ir a corregir» y «Excluir N piezas de esta exportación».
2. **Given** que se excluyen, **When** se relanza, **Then** no viajan al servidor y la nota «N piezas excluidas de esta exportación» ofrece «Volver a incluirlas».
3. **Given** piezas donde el QR se solapa con el texto, **When** se exporta, **Then** se pide confirmación («Generar de todos modos»).

---

### User Story 7 - Visor del PDF y SVG de una pieza (Priority: P3)

Antes de descargar se ve la hoja como en un lector de PDF; en el paso Diseño se puede bajar el SVG de una sola pieza.

**Why this priority**: ayuda a decidir, no es el entregable.

**Independent Test**: `src/components/editor/PdfViewer.test.tsx`; `src/components/records/builder-actions.test.ts` para el SVG de una pieza.

**Acceptance Scenarios**:

1. **Given** 8 piezas con 6 por hoja, **When** se abre el visor, **Then** el contador muestra «/ 2» y «Página anterior» está deshabilitado.
2. **Given** el visor, **When** se usa, **Then** hay miniaturas ocultables, «Ajustar al ancho» (valor inicial), «Ajustar a la página» y zoom por porcentajes, y RePág/AvPág cambian de hoja.
3. **Given** una pieza exportable, **When** se pulsa «Descargar SVG de esta pieza», **Then** se descarga `<mesa>-<area>.svg`; con QR pendiente o errores se avisa y no se descarga.

### Edge Cases

- Más de 5000 piezas o cuerpo mayor que `EXPORT_MAX_BODY_BYTES` (8 388 608 por defecto): 400 y 413.
- Piezas repetidas, plantilla desconocida, ajustes de plantilla inválidos o campos extra: 400.
- Fuentes de las piezas ausentes en el servidor: 503 `FONTS_MISSING` antes de abrir el stream.
- Link o clave del QR manipulados: 400 `QR_IDENTITY_MISMATCH` con el id de la pieza; nada se dibuja.
- Instantánea del QR que ya no está en el storage durante el stream: trama `ERROR` `QR_UNRESOLVED` con `recordId`.
- Tiempo máximo (`EXPORT_TIMEOUT_MS`, 60 000 ms): trama `ERROR` `EXPORT_TIMEOUT`, sin `DONE`.
- Tercera exportación simultánea (2 por instancia): 429 `BUSY`, `Retry-After: 5`, sin cola.
- Servidor en apagado ordenado: 503 `DRAINING`, `Retry-After: 10`.
- Archivo cuyo tamaño final no coincide con `FILE_META`: se trata como `STREAM_TRUNCATED`.
- Nombre vacío tras sanear: se usa el predeterminado; nombres reservados de Windows reciben `_`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `POST /api/export` DEBE declararse con `withApiGuards` (host, autenticación, CSRF y `Content-Type: application/json`, rate limit, semáforo sin cola, tamaño máximo) y rechazar con 503 durante el apagado ordenado. Contrato: [contracts/export-api.md](./contracts/export-api.md).
- **FR-002**: El cuerpo DEBE validarse con `ExportRequestSchema` (estricto: 1 a 5000 registros, `templateId` igual a `layout.templateId`, ids únicos); un fallo devuelve 400 con una entrada por problema y el `recordId` cuando aplica.
- **FR-003**: La exportación NO DEBE subir archivos, generar QR ni salir a la red: el storage es de solo lectura (`Pick<StorageProvider, "get" | "keyFromPublicUrl">`) y se verifica la identidad del QR de cada registro (Constitución II).
- **FR-004**: La respuesta DEBE ser un stream `application/octet-stream` de tramas `[tipo:u8][longitud:u32 BE][payload]` (`PROGRESS`, `FILE_META`, `FILE_CHUNK` de 64 KB, `DONE`, `WARNING`, `ERROR`), con `Cache-Control: no-store`.
- **FR-005**: Las comprobaciones previas (plantilla, fuentes, identidad del QR) DEBEN hacerse antes de abrir el stream para responder con un estado HTTP real.
- **FR-006**: El progreso DEBE emitirse como máximo 10 veces por segundo; cancelar (`request.signal`) o agotar `EXPORT_TIMEOUT_MS` DEBE detener el bucle entre piezas y liberar el semáforo.
- **FR-007**: Las opciones del PDF (`PDFOptionsSchema`) DEBEN ser: `mode` (`sheet` | `single`), `pageSize` (`A4`, `Letter` o personalizado de 10 a 1500 mm), `orientation` (`portrait`, `landscape`, `auto`), `margins` 0–100 mm, `gapMm` 0–50, `bleedMm` 0–5, `maxCols`/`maxRows` 1–50 (opcionales), `center`, `textMode` (`outlined` | `live`), `cutLine` (`none` | `rgb` | `spot`), `colorSpace` (`rgb` | `cmyk`) e `includeQrBackground`.
- **FR-008**: Los valores por defecto DEBEN ser `PDF_DEFAULTS`: hoja, A4 vertical, márgenes 10 mm, separación 5 mm, sangrado 0, centrado, `textMode: "live"`, `cutLine: "none"`, `colorSpace: "rgb"`, fondo del QR activado.
- **FR-009**: La interfaz (`PdfOptionsPanel`) DEBE exponer disposición, página, orientación, medidas personalizadas, márgenes, separación, sangrado, centrado, texto vivo/contornos, fondo blanco bajo el QR, ZIP y nombre de cada SVG; `cutLine`, `colorSpace`, `maxCols` y `maxRows` solo existen en el esquema y la API.
- **FR-010**: El ZIP DEBE construirse en el servidor con `fflate` (`Zip` + `ZipDeflate` nivel 6), con entradas `001.svg…` (relleno `max(3, dígitos(total))`) o `001-<area>-<mesa>.svg`, y nombre `<fileName>.zip`.
- **FR-011**: El SVG del ZIP DEBE llevar las capas (`artwork`, `qr`, `text`, y `background`/`cutline` si existen) con `width`/`height` en mm; su texto es vivo por defecto (`svg.textMode`).
- **FR-012**: El nombre del archivo DEBE resolverse al pulsar Descargar: el escrito (saneado, hasta 120 caracteres) o `qr-production-YYYY-MM-DD-HHmm` en hora local.
- **FR-013**: El cliente DEBE leer las tramas con `runExportJob`, informar de las fases `generating`, `preparing` y `downloading`, y lanzar `STREAM_TRUNCATED` si el cuerpo termina sin `DONE` ni `ERROR`.
- **FR-014**: El cliente DEBE mostrar un diálogo no descartable con fase, barra, contador y [Cancelar] mientras genera, un chip de estado (`GenerationStatus`) y activar `beforeunload`.
- **FR-015**: Antes de exportar, el cliente DEBE resolver los QR pendientes, listar las piezas bloqueantes con salidas «Ir a corregir» y «Excluir», y confirmar los solapes.
- **FR-016**: El visor (`PdfViewer`) DEBE mostrar las piezas reales colocadas con `packGrid`, con miniaturas, página anterior/siguiente, campo de página, zoom 25–300 % más ajustar al ancho y a la página, y virtualización de hojas y miniaturas.
- **FR-017**: «Descargar SVG de esta pieza» DEBE descargar el SVG que dibuja el servidor (`/api/preview/tiles`) solo para piezas exportables.

### Key Entities

- **ExportRequest**: `records` (proyección mínima de cada pieza: campos, `qrUrl`, `qr`, `qrAck`), `templateId`, `templateOverrides`, `layout`, `options`.
- **ExportOptions**: `fileName`, `formats` (`pdf`, `svgZip`), `pdf` (PDFOptions), `svg` (`textMode`, `cutLine`), `zipNaming` (`index` | `index-area-mesa`).
- **Trama**: unidad del stream (tipo, longitud, payload). Detalle en el contrato.
- **Generation** (estado de sesión): fase (`resolving`, `generating`, `preparing`, `downloading`, `done`, `error`, `cancelled`), contadores y resultado con el ZIP.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La ruta real devuelve un PDF vectorial (0 imágenes) y un ZIP `001…` con progreso, metadatos, trozos y `DONE` (`tests/integration/export.test.ts`, «PDF vectorial y ZIP de SVG numerado 001…»).
- **SC-002**: La exportación no cambia el storage (`tests/integration/export.test.ts`, «no sube nada ni crea QR», AC28).
- **SC-003**: Con los valores por defecto el PDF trae texto real y fuente incrustada (`tests/integration/export.test.ts`, «con los valores por defecto el texto es vivo»).
- **SC-004**: Los problemas de piezas devuelven 400 con `recordId` por pieza; manipular la clave o el link da `QR_IDENTITY_MISMATCH` (`tests/integration/export.test.ts`).
- **SC-005**: Cancelar libera el cupo (`inUse` vuelve a 0), el tiempo máximo corta con `EXPORT_TIMEOUT`, la tercera exportación recibe 429 y el apagado ordenado 503 (`tests/integration/export.test.ts`).
- **SC-006**: Las tramas se codifican y decodifican en ambos sentidos, incluso partidas byte a byte, y un corte a mitad de trama es un error explícito (`src/lib/export/frames.test.ts`).
- **SC-007**: El cliente cubre fases, truncado, red, errores HTTP y cancelación (`src/lib/export/client.test.ts`; `src/components/editor/export-actions.test.ts`).
- **SC-008**: 1000 piezas con QR, PDF y descarga producen un PDF de 167 páginas (`tests/e2e/export-1000.spec.ts`; la medición de 10.5 s está en las notas de la Fase 10 y no se ha repetido para este documento).
- **SC-009**: El nombre se sanea y el ZIP se numera (`src/lib/export/file-name.test.ts`).

## Assumptions

- El usuario ya resolvió el diseño de la pieza (spec 004) antes de exportar; esta feature no cambia plantillas.
- El PDF se acumula en memoria para conocer su tamaño exacto; el modelo de trabajos con SSE para más de 10 000 piezas o 100 MB queda fuera del alcance (§S5).
- Los límites por defecto vienen de `.env.example`: 5000 registros, 8 388 608 bytes, 2 exportaciones simultáneas, 60 000 ms y 6 solicitudes por minuto.
- Las pruebas de integración se saltan si falta la fuente (`HAS_PIECE_FONT`).

## Pendientes (No verificado)

- **Apertura real en Illustrator** del PDF y del SVG (mm + `viewBox`, capas del SVG, texto vivo con la fuente instalada): `scripts/illustrator-check.jsx` no se ha ejecutado desde el repositorio.
- **Lectura del QR impreso o grabado** y la hoja de calibración: pendientes en taller.
- Comportamiento de la descarga de Blobs grandes en navegadores distintos del usado en Playwright.
- Más de una descarga automática (PDF y ZIP) se evita ofreciendo el ZIP como botón; que un navegador la bloquearía no está verificado.
