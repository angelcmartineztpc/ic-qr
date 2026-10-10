# Feature Specification: Piezas vectoriales y plantillas

**Feature Branch**: `004-piezas-vectoriales-y-plantillas` (retrospectiva; se desarrolló en la rama `integracion-front-back`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: Documentación retrospectiva de la pieza física: plantilla `tropical-table` v2.0.0 (70 × 70 mm), plantillas `restaurant-default` y `custom-template`, y la escena única (`TileScene`) con tres salidas (SVG por pieza, PDF y contornos). Referencias: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §E (E.1–E.11), §A.6–A.7, «Notas de implementación de la Fase 4» y «Cambio de tinta (2026-10-06→2026-10-09)».

## User Scenarios & Testing *(mandatory)*

### User Story 1 - La pieza reproduce la referencia (Priority: P1)

Quien diseña necesita que cada pieza impresa o grabada sea idéntica a `QR_Tropical_1M_Alimentos.pdf`: 70 × 70 mm, marco, cinco líneas de texto con los literales de la referencia y el QR en su posición.

**Why this priority**: es el producto. Una pieza con medidas, tipografía o tinta distintas no sirve en fabricación.

**Independent Test**: construir la escena de `tropical-table` con área «Tropical» y mesa «M1» y comparar bases, tamaños y centros de cada línea con las medidas de la referencia (`src/server/fonts/piece-font.integration.test.ts`, requiere `bun run fonts:setup`).

**Acceptance Scenarios**:

1. **Given** la plantilla `tropical-table` v2.0.0, **When** se construye la escena, **Then** la pieza mide 70 × 70 mm, el marco es un rectángulo de trazo 0.5 pt y no hay avisos de composición.
2. **Given** área «Tropical» y mesa «M1», **When** se construye la escena, **Then** las cinco líneas son `TROPICAL` (17 pt), `MESA – TABLE` (11 pt), `M1` (22 pt), `CONSULTA EL MENU Y ORDENA EN LÍNEA` y `LOOK AT THE MENU AN ORDER ON LINE` (13.2 pt), con bases a ±0.03 mm de la referencia y centradas en x = 35 mm (±0.15 mm).
3. **Given** un QR de versión 4, **When** se coloca en la plantilla, **Then** ocupa un cuadrado de 24.788 mm en (22.606, 39.424) con 33 módulos de ≈ 0.751 mm y sin zona de silencio propia.
4. **Given** cualquier pieza, **When** se genera, **Then** texto, QR y marco usan negro puro `#000000` en RGB y no aparece `2C2E35`.

---

### User Story 2 - Una escena, tres salidas (Priority: P1)

El mismo `TileScene` produce la vista previa y el SVG por pieza (renderizador SVG), el PDF (pdfkit) y la versión con texto en contornos, de modo que lo que se ve es lo que se fabrica.

**Why this priority**: elimina la divergencia entre vista previa, SVG y PDF (Constitución I y IV).

**Independent Test**: construir una escena y comprobar que `renderSceneSvg` y `PdfSheetWriter` la dibujan con las mismas medidas (`src/lib/svg/render-scene.test.ts`, `src/server/pdf/pdf.integration.test.ts`).

**Acceptance Scenarios**:

1. **Given** una escena, **When** se renderiza como SVG, **Then** el `<svg>` declara `width`/`height` en mm y un `viewBox` en décimas de mm, tiene un `<g id>` por capa (`background`, `artwork`, `qr`, `text`, `cutline` si existen), ids únicos y ninguna imagen, estilo ni script.
2. **Given** el mismo texto hostil (con `<`, `&`, comillas), **When** se serializa, **Then** nada del usuario inyecta elementos ni atributos.
3. **Given** la misma escena, **When** se dibuja en el PDF, **Then** cada pieza es un bloque con `translate(posición en pt)` y `scale(2.834646)`, y no se emite ninguna imagen.

---

### User Story 3 - El QR es un único path compuesto (Priority: P1)

El grabado láser necesita el QR como un solo contorno vectorial, sin cientos de cuadros sueltos.

**Why this priority**: es la regla de salida de Constitución IV y condición para que Illustrator lo trate como un objeto.

**Independent Test**: `src/lib/qr/qr.test.ts` compara el contorno con la matriz módulo a módulo (300 casos aleatorios, `nonzero` y `evenodd`); `src/server/pdf/pdf.integration.test.ts` cuenta un único relleno `f*` por pieza.

**Acceptance Scenarios**:

1. **Given** una matriz de QR, **When** se convierte a path, **Then** el resultado es un solo `<path id="qr-code">` con `fill-rule="evenodd"` y solo comandos absolutos `M`, `L` y `Z`.
2. **Given** una pieza en el PDF, **When** se inspecciona el contenido, **Then** hay exactamente un operador `f*` (relleno even-odd) por pieza.
3. **Given** una URL de hasta 34 caracteres con corrección H, **When** se codifica, **Then** el QR es versión 4 (33 módulos); con 35 caracteres pasa a versión 5 (37 módulos).

---

### User Story 4 - Texto en contornos o vivo (Priority: P2)

Fabricación necesita texto convertido a contornos (no depende de fuentes instaladas); diseño necesita texto vivo editable en Illustrator.

**Why this priority**: son los dos usos reales del archivo. La opción elegida por defecto es el texto vivo (ver spec 005).

**Independent Test**: generar el PDF de una pieza en cada modo y comprobar fuentes y operadores de texto (`src/server/pdf/pdf.integration.test.ts`).

**Acceptance Scenarios**:

1. **Given** `textMode: "outlined"`, **When** se genera el PDF, **Then** hay 0 fuentes y 0 operadores `BT`, `Tj` y `TJ`.
2. **Given** `textMode: "live"`, **When** se genera el PDF, **Then** la fuente Address Sans Pro Cd va incrustada con `ToUnicode` y el texto extraído contiene `MESA–TABLE`, `TROPICAL` y las dos líneas CTA.
3. **Given** el SVG en modo vivo, **When** se serializa, **Then** cada línea es un `<text font-family="Address Sans Pro Cd">` con su posición ya calculada.

---

### User Story 5 - Empaquetado en hojas A4 (Priority: P2)

Quien produce necesita imprimir varias piezas por hoja con una rejilla exacta y centrada.

**Why this priority**: reduce hojas y errores de corte; depende de las medidas de la pieza.

**Independent Test**: `src/lib/document/sheet.test.ts` (tabla de §E.7) y `src/server/pdf/pdf.integration.test.ts`.

**Acceptance Scenarios**:

1. **Given** A4 vertical, márgenes de 10 mm y separación de 5 mm, **When** se empaquetan piezas de 70 mm, **Then** caben 6 por página (2 columnas × 3 filas) y la primera está en (32.5, 38.5) mm.
2. **Given** 16 piezas, **When** se genera el PDF, **Then** salen 3 páginas, todas con MediaBox A4 exacta (595.275591 × 841.889764 pt, ±1e-4).
3. **Given** una pieza que no cabe en el área imprimible, **When** se calcula la rejilla, **Then** se lanza `TILE_DOES_NOT_FIT` con el área disponible en mm.

---

### User Story 6 - Plantillas alternativas y calibración (Priority: P3)

Existen `restaurant-default` y `custom-template` como variantes y base para plantillas nuevas, y una hoja de calibración para validar en el material real los umbrales de QR y texto.

**Why this priority**: soporte de futuro y validación en taller; la producción actual usa `tropical-table`.

**Independent Test**: `restaurant-default` construye sin avisos con todos los campos (`piece-font.integration.test.ts`); `bun run render:sample` genera `out/calibration.pdf`.

**Acceptance Scenarios**:

1. **Given** `restaurant-default` con Estación, Sub-grupo y Concepto rellenos, **When** se construye la escena, **Then** no hay avisos; con esos campos vacíos las líneas se ocultan (`hideWhenEmpty`).
2. **Given** `tropical-table`, **When** se pide la hoja de calibración, **Then** se obtienen 16 piezas: QR versiones 4–9 en normal e invertido (12) y texto de 4.5, 5, 5.5 y 6 pt (4).

### Edge Cases

- **Área larga**: `fit: shrink` reduce el tamaño hasta `minSizePt` (10 pt en el área de `tropical-table`); por debajo se emite `TEXT_OVERFLOW` en el eje x.
- **Carácter sin glifo**: un carácter fuera de `SUPPORTED_CHARSET` o ausente en la fuente produce `MISSING_GLYPH`.
- **Módulo de QR pequeño**: se emite `QR_MODULE_SMALL` con nivel `warn` (por debajo de `warnModuleMm`, 0.60 mm por defecto) o `block` (por debajo de `minModuleMm`, 0.45 mm).
- **Sin fondo blanco del QR** o QR invertido: aviso `QR_NO_WHITE_BACKGROUND`.
- **Sangrado > 0** en modo una pieza por página: se emiten `TrimBox` (pieza) y `BleedBox`; texto y QR no se mueven.
- **Fuente ausente en el servidor**: el servidor no puede construir la escena (`MissingFontError`); la exportación lo informa antes de abrir el stream (spec 005).
- **Fuente equivocada**: Address Sans Pro «SemiBold» de ancho normal no es la Cd y `fonts:setup` la rechaza por la huella de anchos del manifiesto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La plantilla `tropical-table` v2.0.0 DEBE medir 70 × 70 mm y dibujar un marco de 0.5 pt (rectángulo `frame`, trazo `#000000`).
- **FR-002**: La plantilla DEBE imprimir `{{area}}` (mayúsculas), `MESA – TABLE`, `{{mesa}}` (mayúsculas) y los literales `CONSULTA EL MENU Y ORDENA EN LÍNEA` y `LOOK AT THE MENU AN ORDER ON LINE`; Estación, Sub-grupo y Concepto son metadatos y no se imprimen.
- **FR-003**: El QR DEBE ocupar un cuadrado de 24.788 mm en (22.606, 39.424) mm con `quietZoneModules: 0`.
- **FR-004**: La tinta de texto, QR y marco DEBE ser `#000000` en RGB, definida una sola vez en `PIECE_INK` (`src/templates/address-sans.ts`).
- **FR-005**: La tipografía de las piezas DEBE ser Address Sans Pro Cd Semibold (`.woff2`, no versionado); Gotham es solo de la interfaz y no se usa en piezas.
- **FR-006**: DEBEN existir `restaurant-default` y `custom-template` registradas en `src/templates/index.ts` y validadas con `TemplateSchema` al cargar el módulo.
- **FR-007**: `buildScene` DEBE ser la única descripción geométrica de la pieza: coordenadas en mm, origen arriba a la izquierda, orden de nodos = orden de pintado.
- **FR-008**: El SVG DEBE declarar `width`/`height` en mm con `viewBox` en décimas de mm, un `<g id>` por capa, ids únicos y ningún `<image>`, `<style>`, `<use>` ni script.
- **FR-009**: El PDF DEBE ser vectorial (0 imágenes), con el tamaño de página calculado desde mm (`pageSizePt`) y no desde el nombre `A4` de pdfkit.
- **FR-010**: El QR DEBE emitirse como un único path compuesto con relleno `evenodd`, con las aristas compartidas anuladas.
- **FR-011**: El texto DEBE poder emitirse en contornos (`outlineScene`: un path por línea, con `<title>` del texto original) o vivo (fuente incrustada con `ToUnicode` en el PDF; `<text>` en el SVG).
- **FR-012**: `packGrid` DEBE calcular la rejilla con `n = floor((A + gap) / P + 1e-9)`, centrado opcional y posiciones por multiplicación, y DEBE lanzar `TILE_DOES_NOT_FIT` si no cabe ninguna pieza.
- **FR-013**: El juego de caracteres admitido (`SUPPORTED_CHARSET`) DEBE ser ASCII imprimible, Latin-1, Latin Extended-A, `– —`, comillas tipográficas, `•`, `…` y `€`, menos 8 caracteres que la fuente no trae (U+005E, U+007E, U+00A0, U+00A4, U+00AC, U+00AD, U+017F, U+201B).
- **FR-014**: El sistema DEBE avisar (`TEXT_OVERFLOW`, `MISSING_GLYPH`, `QR_MODULE_SMALL`, `QR_NO_WHITE_BACKGROUND`) en lugar de truncar en silencio.
- **FR-015**: `calibrationTiles` DEBE generar 16 piezas de calibración y `bun run render:sample` DEBE escribirlas en `out/calibration.pdf`.
- **FR-016**: `bun run fonts:setup` DEBE instalar las fuentes en `.woff2` y rechazar un archivo cuyo sha256 o huella de anchos no coincida con `manifest.json`.

### Key Entities

- **Template**: datos Zod: `id`, `version`, `tile` (ancho, alto, margen de seguridad, fondo opcional), `fontDir`, `fonts`, `defaultLayout` (cajas de contenido y QR), `content.items`, `qr`, `shapes`. Ver [data-model.md](./data-model.md).
- **TemplateOverrides**: ajustes del usuario sobre una plantilla (por línea: texto, tamaño, alineación, color, peso, márgenes; zona de silencio y color del QR).
- **TileScene**: lista ordenada de nodos (`rect`, `path`, `text`, `qrExternal`) con capa, más avisos y metadatos.
- **SheetLayout / PageSlot**: rejilla de la hoja y posición de cada pieza.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La pieza coincide con la referencia: 70 × 70 mm, bases de línea a ±0.03 mm y centros a ±0.15 mm, QR de 24.788 mm en (22.606, 39.424) (`src/server/fonts/piece-font.integration.test.ts`; `src/schemas/schemas.test.ts` fija el layout por defecto).
- **SC-002**: 0 imágenes en el PDF y 0 operadores de imagen pintados (`src/server/pdf/pdf.integration.test.ts`).
- **SC-003**: Contorno del QR idéntico a la matriz en 300 casos aleatorios con `nonzero` y `evenodd` (`src/lib/qr/qr.test.ts`); un solo `f*` por pieza (`pdf.integration.test.ts`).
- **SC-004**: MediaBox A4 exacta (±1e-4 pt) y 6 piezas por hoja; 16 piezas → 3 páginas; pieza de 198.425 pt (`pdf.integration.test.ts`, `src/lib/document/sheet.test.ts`).
- **SC-005**: 1000 piezas en el PDF en menos de 10 s, 167 páginas (`pdf.integration.test.ts`, «1000 piezas en menos de 10 s»).
- **SC-006**: La tinta `#000000` aparece en texto, QR y marco y `2C2E35` no aparece (`piece-font.integration.test.ts`, «la tinta es negro puro»).
- **SC-007**: El SVG es XML bien formado, con ids únicos, sin elementos prohibidos y con texto hostil escapado (`src/lib/svg/render-scene.test.ts`).
- **SC-008**: Todo carácter de `SUPPORTED_CHARSET` tiene glifo en la fuente real (`piece-font.integration.test.ts`, «cubre todo el juego de caracteres admitido»).

## Assumptions

- La fuente `AddressSansPro-CdSemibold.woff2` está instalada en `assets/fonts/address-sans/` en las máquinas de desarrollo y en el servidor; sin ella los tests dependientes se saltan (`HAS_PIECE_FONT`).
- La licencia de Adobe Fonts debe cubrir incrustar contornos en PDF/SVG y su uso en servidor; `manifest.json` lo deja como pendiente de confirmar.
- El color es RGB (decisión del 2026-10-09); CMYK y la tinta plana `CutContour` existen como opciones del PDF (ver spec 005).
- Los umbrales de módulo (0.60 y 0.45 mm) y de texto mínimo son estimaciones; la hoja de calibración los validará en taller.

## Pendientes (No verificado)

- **Apertura real en Illustrator** (AC27) y comportamiento de mm + `viewBox` y de las capas del SVG: prueba manual; `scripts/illustrator-check.jsx` no se ha ejecutado desde el repositorio.
- **Lectura del QR impreso o grabado**: `jsqr` y `qr/decode` lo leen en pruebas de software; la lectura sobre el material con un móvil depende de la hoja de calibración, pendiente en taller.
- La licencia de Address Sans Pro Cd para uso en servidor.
