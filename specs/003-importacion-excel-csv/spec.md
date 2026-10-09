# Feature Specification: Importación de Excel (.xlsx) y CSV

**Feature Branch**: `003-importacion-excel-csv` (retrospectiva; se desarrolló en la rama `integracion-front-back`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: Documentación retrospectiva de la importación de piezas desde un `.xlsx` o un `.csv`. Fuentes normativas: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §S1 (estrategia Excel), §1.2-10, 15, 16, 24, 25 y 28, y las «Notas de implementación de la Fase 7» con su adenda (CSV y Link del menú común). Código: `src/lib/excel`, `src/server/excel`, `src/app/api/import/excel`, `src/components/import`, `src/lib/app/import-client.ts`. Depende del modelo de [`specs/001-registros-y-validacion`](../001-registros-y-validacion/spec.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar un `.xlsx` y revisar el resumen (Priority: P1)

La persona sube un libro en `/import`; el sistema detecta la hoja y las columnas, valida cada fila con las mismas reglas del formulario y muestra «Filas encontradas», «Válidas», «Con errores» y «Duplicadas», con pestañas Errores, Duplicados y Avisos.

**Why this priority**: es la vía principal para crear cientos de piezas ([§1.1](../../docs/ARCHITECTURE.md), prioridad 1: «ninguna fila perdida»).

**Independent Test**: subir un libro con 100 filas válidas y 5 con error; se obtienen 100 importables y 5 listadas con su número real de fila de Excel. Cubierto por `tests/integration/api-import.test.ts` y `src/components/import/ImportScreen.test.tsx`.

**Acceptance Scenarios**:

1. **Given** un libro con cabeceras en otro orden, con alias («No. Mesa», «Link del menú (URL)») o con un título encima, **When** se importa, **Then** se detecta la fila de cabecera y se mapean las columnas.
2. **Given** filas con errores, **When** se muestra el resumen, **Then** cada error se lista como «Fila 18: Falta Link del menú», «Fila 32: Mesa vacía» o «Fila 56: Link del menú inválido».
3. **Given** una celda de Mesa numérica, **When** se coerciona, **Then** se importa como «1» y no «1.0»; las fechas pasan a ISO con aviso.
4. **Given** columnas no reconocidas, **When** se importa, **Then** sus datos se conservan en `metadata.extra` con aviso informativo.
5. **Given** una fila con Link del QR válido, **When** se confirma, **Then** la pieza nace como QR existente y nunca se genera otro.

---

### User Story 2 - Importar un `.csv` (Priority: P1)

El mismo flujo admite `.csv` en UTF-8 (con o sin BOM) o Windows-1252, con separador coma, punto y coma o tabulador.

**Why this priority**: las hojas de cálculo reales llegan como CSV exportado de Excel en español (adenda de la Fase 7).

**Independent Test**: subir un CSV con punto y coma y Windows-1252 y comprobar que se encuentra la cabecera bajo un título. Cubierto por `src/lib/excel/csv.test.ts` y `tests/integration/api-import.test.ts`.

**Acceptance Scenarios**:

1. **Given** un CSV con BOM y columnas extra, **When** se importa, **Then** las filas válidas se importan y las columnas extra se conservan.
2. **Given** celdas con comillas, comas y saltos de línea dentro de comillas, **When** se lee, **Then** se respetan (RFC 4180).
3. **Given** un archivo binario renombrado a `.csv`, **When** se envía, **Then** se rechaza con «Formato no compatible».

---

### User Story 3 - Rechazar de forma segura lo que no es un libro válido (Priority: P1)

Archivos `.xls`, con macros, plantillas, `.xlsb`, bombas de descompresión, ZIP con EOCD falso o demasiado grandes se rechazan antes de llegar a SheetJS, con un mensaje que explica por qué, y el servidor sigue respondiendo.

**Why this priority**: SheetJS procesa archivos de terceros; es la superficie de ataque más grande de la app ([§1.3-8](../../docs/ARCHITECTURE.md), constitución VI).

**Independent Test**: enviar una bomba de descompresión y verificar el rechazo 422 y que el siguiente envío legítimo se procesa. Cubierto por `src/server/excel/upload-guard.test.ts` y `tests/integration/api-import.test.ts` (casos hostiles).

**Acceptance Scenarios**:

1. **Given** un `.xls` antiguo o cifrado (OLE), **When** se envía, **Then** responde 422 con «Formato .xls antiguo o con contraseña».
2. **Given** un `.xlsm`, una plantilla `.xltx` o un `.xlsb`, **When** se envía, **Then** se rechaza por su content type o sus componentes, no por la extensión.
3. **Given** una bomba que declara poco y infla mucho, **When** se envía, **Then** se rechaza (`ZIP_BOMB` o `ZIP_SIZE_MISMATCH`).
4. **Given** un `.xls`, `.xlsm`, `.tsv` u otro formato, **When** se elige en el navegador, **Then** se rechaza por extensión sin llamar al servidor.
5. **Given** una lectura que supera el tiempo máximo, **When** el worker agota 10 s, **Then** se termina y se responde `PARSE_TIMEOUT`.

---

### User Story 4 - Confirmar las columnas cuando faltan o son ambiguas (Priority: P2)

Si falta una columna obligatoria (Área, Mesa, Link del menú) o hay una ambigua, no se procesa ninguna fila y se abre «Confirma las columnas»; al aplicar la asignación el archivo se reenvía.

**Why this priority**: evita perder un archivo entero por un encabezado distinto ([§S1.5](../../docs/ARCHITECTURE.md)).

**Independent Test**: subir un libro sin la columna Mesa; se abre el diálogo y, al aplicar, se reenvía con `X-Column-Mapping`. Cubierto por `ImportScreen.test.tsx` y `tests/e2e/import.spec.ts`.

**Acceptance Scenarios**:

1. **Given** un libro sin columna Mesa, **When** se importa, **Then** `totalRows = 0`, aparece «Confirma las columnas» y el botón de confirmar importación no actúa.
2. **Given** una columna que nombra dos campos («Link QR del menú»), **When** se detecta, **Then** se marca ambigua y la persona decide.
3. **Given** un mapeo manual, **When** se envía, **Then** gana siempre sobre la detección y un campo no puede ir en dos columnas.

---

### User Story 5 - Duplicados con clave configurable y modo Añadir o Reemplazar (Priority: P2)

El resumen recalcula los duplicados en el cliente con la clave del proyecto, también contra las piezas existentes, y ofrece Mantener (por defecto), Eliminar duplicados o Revisar manualmente, con el modo Añadir o Reemplazar.

**Why this priority**: evita placas repetidas sin borrar nada en silencio ([§1.2-10](../../docs/ARCHITECTURE.md)).

**Independent Test**: importar un libro con una fila repetida y elegir «Eliminar duplicados»; la copia queda en el informe. Cubierto por `src/lib/excel/review.test.ts`, `import-actions.test.ts` y `tests/e2e/import.spec.ts`.

**Acceptance Scenarios**:

1. **Given** filas duplicadas, **When** se elige Mantener, **Then** se crean todas y las copias llevan `metadata.duplicateOf` y el chip «Duplicado».
2. **Given** «Eliminar duplicados», **When** se confirma, **Then** el botón dice «Importar N · descartar M» y las descartadas se listan en el informe.
3. **Given** «Revisar manualmente», **When** se abre, **Then** cada copia tiene un interruptor Conservar/Descartar, por defecto descartar.
4. **Given** modo Reemplazar con cambios sin guardar, **When** se confirma, **Then** se pregunta «Tienes cambios sin guardar. Se reemplazarán las N piezas actuales.».
5. **Given** el invariante `totalRows = válidas + con errores + duplicadas`, **When** se calcula el resumen, **Then** ninguna fila se cuenta dos veces.

---

### User Story 6 - Link del menú común para filas sin link (Priority: P2)

La persona puede indicar un Link del menú (también eligiéndolo por resort y servicio) que se aplica solo a las filas con la celda vacía o sin columna de menú.

**Why this priority**: muchos archivos de hotel traen un único menú para todas las mesas (adenda de la Fase 7).

**Independent Test**: importar filas sin link con `X-Default-Menu-Url`; la columna deja de ser obligatoria. Cubierto por `tests/integration/api-import.test.ts`.

**Acceptance Scenarios**:

1. **Given** un archivo sin columna de menú y un link común válido, **When** se importa, **Then** las filas usan ese link y queda el aviso «Link del menú común usado en N filas».
2. **Given** un link común inválido, **When** se importa, **Then** las filas quedan como error y no se inventa ningún dato.

---

### User Story 7 - Informe de errores, filas a corregir y resultado persistente (Priority: P3)

Las filas rechazadas se descargan en un CSV, pueden importarse como «piezas a corregir» y el último resultado sobrevive a recargar hasta descartarlo.

**Why this priority**: cumple «nada silencioso» y evita reimportar para recuperar las filas con error ([§S1.9](../../docs/ARCHITECTURE.md)).

**Independent Test**: importar 100 + 5, descargar el informe y recargar. Cubierto por `src/lib/excel/error-report.test.ts`, `import-actions.test.ts` y `tests/e2e/import.spec.ts`.

**Acceptance Scenarios**:

1. **Given** filas con error, **When** se descarga el informe, **Then** el CSV lleva BOM, cabecera en español y las celdas que empiezan por `= + - @`, tabulador o retorno van prefijadas con `'`.
2. **Given** «Importar también las filas con error», **When** se confirma, **Then** se crean con `validationErrors` y sin lanzar su QR.
3. **Given** un resultado sin confirmar, **When** se recarga la página, **Then** sigue visible con sus filas con error hasta «Descartar».

---

### Edge Cases

- Más de 5000 filas con datos: rechazo `TOO_MANY_ROWS` y acción «Importar solo las primeras 5000», que deja el aviso `ROWS_TRUNCATED_BY_USER`.
- Filas totalmente vacías: no cuentan y se registran en `stats.emptyRowsSkipped`.
- Celdas combinadas en filas de datos: se rellenan con un solo aviso por rango; las de cabecera o título no se tocan.
- Celdas con error de Excel: la fila se rechaza pero se conserva en `rejected`.
- Link del QR con puerto distinto de 443 o host no permitido: la fila se importa con aviso y la pieza nace con `qrError`; con credenciales, la fila se rechaza.
- Link del menú con `http`: aviso, la fila se importa.
- Hojas ocultas: se ignoran al elegir hoja; las filas ocultas no se avisan.
- Nombre de archivo con `–`, emoji o CJK: viaja en `X-File-Name` con `encodeURIComponent`.
- Un resultado que necesita mapeo no se persiste en `last-import`.
- El `File` no se persiste: tras recargar hay que volver a elegirlo para reenviarlo con otro mapeo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE aceptar `.xlsx` y `.csv` mediante `POST /api/import/excel` con el archivo como cuerpo binario (no multipart); el archivo nunca se guarda. Detalle en [`contracts/import-excel.md`](./contracts/import-excel.md).
- **FR-002**: El servidor DEBE decidir el formato por el contenido (firma ZIP u OLE o texto), no por la extensión; el navegador DEBE rechazar antes de subir cualquier extensión distinta de `.xlsx` o `.csv`, un archivo vacío o uno de más de 10 MB.
- **FR-003**: El guard del contenedor DEBE ejecutarse antes de SheetJS: EOCD único y final, sin ZIP64 ni cifrado, hasta 2000 entradas, cabeceras locales iguales al directorio central, entradas contiguas, content type de libro `.xlsx` y rechazo de `vbaProject.bin` y `workbook.bin`.
- **FR-004**: El guard DEBE inflar en streaming con tope exacto (20 MiB por entrada, 40 MiB en total, ratio 200 en entradas de más de 1 MiB, 300 000 celdas) y entregar a SheetJS solo un ZIP reconstruido con los bytes medidos.
- **FR-005**: SheetJS DEBE correr en un `worker_threads` con `maxOldGenerationSizeMb` de 512 y un temporizador de 10 s, sin leer estilos, HTML ni VBA, y devolver solo celdas crudas.
- **FR-006**: La cabecera DEBE detectarse en las 25 primeras filas con al menos 3 campos reconocidos; se elige la hoja visible con mejor puntuación y se aceptan alias y erratas pequeñas con aviso `FUZZY_HEADER`.
- **FR-007**: Sin las columnas obligatorias (Área, Mesa, Link del menú, salvo link común) o con columnas ambiguas NO se DEBE procesar ninguna fila; el mapeo manual (`X-Column-Mapping`, base64url de JSON, hasta 8 KB) DEBE ganar siempre a la detección.
- **FR-008**: Cada celda DEBE coercionarse con reglas documentadas (enteros sin decimales, 15 dígitos significativos, fechas a ISO con aviso, booleanos con aviso, hipervínculo por destino, `=HYPERLINK("literal")` extraído) y cada fila validarse con `validateDraft`.
- **FR-009**: Ninguna fila DEBE desaparecer: toda fila no vacía está en `successful`, `rejected` o `duplicateRows`, y `totalRows = válidas + con errores + duplicadas`.
- **FR-010**: Con más de 5000 filas el servidor DEBE rechazar con `TOO_MANY_ROWS` salvo que llegue `X-Import-Truncate`, que acepta un entero entre 1 y el máximo configurado.
- **FR-011**: Un Link del QR inválido (no https, credenciales) DEBE rechazar la fila; con puerto distinto de 443 o host no permitido DEBE importarla con aviso y pieza bloqueada. Nunca se genera un QR de respaldo.
- **FR-012**: El CSV DEBE decodificarse como UTF-8 (BOM opcional) o Windows-1252, detectar el separador, respetar RFC 4180 y rechazar binarios; usa la misma tubería que `.xlsx`, sin worker.
- **FR-013**: El Link del menú común (`X-Default-Menu-Url`, máximo 2048 caracteres) DEBE aplicarse solo a celdas vacías o sin columna, volver opcional la columna y dejar el aviso `DEFAULT_MENU_URL_USED`.
- **FR-014**: El cliente DEBE recalcular los duplicados con la clave del proyecto (editable en «Clave de duplicados») y contra las piezas existentes; ofrece Mantener (por defecto), Eliminar duplicados y Revisar manualmente.
- **FR-015**: Confirmar DEBE ser una sola mutación del proyecto (`importRecords`), en modo Añadir (por defecto) o Reemplazar, y lanzar la resolución de QR en lote solo para piezas sin errores propios.
- **FR-016**: El informe de errores DEBE generarse en el cliente, en UTF-8 con BOM, con una línea por problema (Fila, Campo, Problema, Valor y las siete columnas de la pieza) y con prefijo `'` contra inyección de fórmulas.
- **FR-017**: El último `ImportResult` y su resultado DEBEN persistirse en IndexedDB (`last-import`) hasta descartarlo; un `last-import` ilegible se ignora sin bloquear el arranque.
- **FR-018**: La ruta DEBE declararse con `withApiGuards`, aceptar los `Content-Type` del libro `.xlsx`, `application/octet-stream`, `text/csv` y `application/vnd.ms-excel`, limitar el cuerpo a `IMPORT_MAX_BYTES`, aplicar 10 importaciones por minuto y 2 concurrentes por defecto, y responder 413, 415 o 422 según el rechazo.
- **FR-019**: SheetJS DEBE instalarse desde su CDN con versión fija y `bun run check:sheetjs` DEBE avisar (código de salida 2) si hay una versión más nueva.
- **FR-020**: Al confirmar DEBE notificarse «Excel importado: N piezas válidas» (éxito) o «Excel importado: N piezas · M errores · K duplicados no importados» (aviso).

### Key Entities

- **ImportResult**: resultado del servidor: `fileName`, `sheetName`, `headerRow`, `mapping`, `missingColumns`, `totalRows`, `successful`, `rejected`, `errors`, `warnings`, `duplicates`, `duplicateRows` y `stats`. Ver [`data-model.md`](./data-model.md).
- **ImportIssue**: problema con `row`, `column`, `field`, `label`, `message`, `severity`, `code` y `relatedRow` opcional.
- **ColumnMapping**: asignación de una columna de la hoja a un campo, con tipo de coincidencia (`exact`, `fuzzy`, `manual`, `ambiguous`, `none`).
- **DuplicateGroup / DuplicateKeyConfig**: ver la spec 001.
- **ImportSession**: estado de sesión de la importación (`idle`, `uploading`, `review`, `done`, `error`) más estrategia, decisiones y modo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con 100 filas válidas y 5 con error, la importación devuelve 100 importables y 5 listadas con su fila real (`src/lib/excel/import-pipeline.test.ts`, `tests/integration/api-import.test.ts`).
- **SC-002**: El invariante `248 = 240 + 5 + 3` y la ausencia de doble conteo se verifican en `src/lib/excel/review.test.ts` y `src/lib/records/duplicates.test.ts`.
- **SC-003**: El guard se cubre con 18 declaraciones de test en `src/server/excel/upload-guard.test.ts`: rechaza bombas, EOCD falso, ZIP cifrado y descriptores inconsistentes, y acepta libros con descriptor de datos o sin comprimir.
- **SC-004**: Un archivo hostil produce un rechazo 422 y el servidor sigue respondiendo (`tests/integration/api-import.test.ts`, `tests/e2e/import.spec.ts`).
- **SC-005**: Una lectura que supera el tiempo máximo termina con `PARSE_TIMEOUT` (`tests/integration/api-import.test.ts`).
- **SC-006**: El CSV cubre coma, punto y coma, tabulador, BOM, Windows-1252 y comillas (`src/lib/excel/csv.test.ts`).
- **SC-007**: El informe de errores protege las celdas de fórmula y lleva BOM (`src/lib/excel/error-report.test.ts`).
- **SC-008**: La suite completa pasa con 917 tests; la medición de 2000 filas en 0.25 s dentro de la imagen Docker consta en [`docs/ARCHITECTURE.md` Fase 7](../../docs/ARCHITECTURE.md) y no se re-midió.

## Assumptions

- El primer paso de la interfaz (`/editor`, con `/import` como parte del mismo paso) es el único punto de entrada de la importación.
- La resolución de QR en lote tras confirmar usa la acción `resolve` de `builder-actions` (spec 001); su contrato HTTP (`/api/qr/resolve`) queda fuera de esta spec.
- Un Link del QR existente no se descarga durante la importación; su verificación ocurre después, en la resolución en lote.
- Los libros reales de Excel 365, Google Sheets y LibreOffice se prueban si se copian a `tests/fixtures/real/`; la carpeta está vacía en el repositorio.

## Pendientes

- No verificado: apertura de libros reales de Excel 365 (Windows y Mac), Google Sheets y LibreOffice; `tests/integration/real-workbooks.test.ts` se omite sin archivos y `tests/fixtures/real/` solo contiene un `README.md`.
- No verificado: límite de 2048 caracteres por celda citado en [§1.2-16](../../docs/ARCHITECTURE.md); en el código solo existen los máximos por campo (120, 120, 40, 120, 120) y 2048 para cada valor de `metadata.extra`.
