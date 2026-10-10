# Feature Specification: Editor visual y flujo en tres pasos

**Feature Branch**: `006-editor-visual-y-flujo-en-tres-pasos` (retrospectiva; se desarrolló en la rama `integracion-front-back`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: Interfaz de producción para armar piezas de 70 × 70 mm con QR: un flujo guiado Piezas → Diseño → Exportar y un editor visual que mueve y redimensiona el QR y el bloque de texto sobre la pieza real, con vista previa dibujada por el servidor.

Documentos de referencia: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §S4 (editor visual), §S12 (responsive), §S13 (sistema visual), «Fase 8», «Notas de la reorganización en tres pasos» y «Notas del visor del PDF»; [`DESIGN.md`](../../DESIGN.md) y [`PRODUCT.md`](../../PRODUCT.md). Datos: [data-model.md](data-model.md). Endpoint: [contracts/preview-tiles.md](contracts/preview-tiles.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recorrer el flujo en tres pasos (Priority: P1)

Quien produce las placas abre la aplicación, retoma o empieza un proyecto y avanza por Piezas (`/editor`, con `/import` como parte del mismo paso), Diseño (`/preview`) y Exportar (`/export`), con un Stepper y un pie de página con Atrás y Siguiente.

**Why this priority**: es la estructura de toda la interfaz; sin ella no se llega ni al editor ni a la exportación.

**Independent Test**: `tests/e2e/stepper.spec.ts` recorre Inicio → `/editor` → `/preview` → `/export` y vuelve a Diseño desde el Stepper.

**Acceptance Scenarios**:

1. **Given** un proyecto con piezas, **When** se abre `/`, **Then** no hay Stepper, hay un solo `h1` y la tarjeta «Continuar» lleva a `/editor`.
2. **Given** `/editor`, **When** se pulsa «Siguiente», **Then** se llega a `/preview` («Diseña la pieza») y luego a `/export` («Exporta el PDF»), donde no hay «Siguiente» porque termina en la descarga.
3. **Given** un proyecto sin piezas, **When** se ven los pasos 2 y 3, **Then** están bloqueados (`aria-disabled`) y `/export` muestra «Aún no hay piezas que exportar».
4. **Given** una generación en curso, **When** se mira el Stepper, **Then** los pasos 2 y 3 siguen bloqueados.
5. **Given** `/import`, **When** se pulsa «← Volver a las piezas», **Then** se regresa a `/editor`; la importación es parte del paso 1.

---

### User Story 2 - Mover y redimensionar el QR y el bloque de texto (Priority: P1)

En `/preview` se arrastra el QR y el bloque de texto sobre la pieza dibujada, se redimensionan con manejadores, se escriben sus coordenadas en mm (o cm) y se mueven con el teclado. Nada sale de la pieza y ningún valor inválido se corrige en silencio.

**Why this priority**: es el propósito del paso Diseño y lo que diferencia la herramienta de un generador de QR fijo.

**Independent Test**: `tests/e2e/preview.spec.ts` (arrastre real en escritorio) y `src/components/editor/PreviewScreen.test.tsx` (teclado, coordenadas y rechazos).

**Acceptance Scenarios**:

1. **Given** una pieza, **When** se arrastra el QR y se suelta, **Then** se guarda un solo paso de deshacer y la posición sobrevive a recargar.
2. **Given** un arrastre en curso, **When** se pulsa Esc, **Then** se cancela y no queda nada que deshacer.
3. **Given** una caja, **When** se arrastra muy lejos, **Then** queda dentro de la pieza de 70 × 70 mm.
4. **Given** el QR seleccionado, **When** se redimensiona por una esquina, **Then** se mantiene cuadrado; el bloque de texto tiene 8 manejadores.
5. **Given** una caja con foco, **When** se pulsan las flechas, **Then** se mueve 0,5 mm (Mayús 5 mm, Alt 0,1 mm).
6. **Given** el campo X, **When** se escribe `500` y se pulsa Enter, **Then** se muestra «Debe quedar dentro de la pieza (70 × 70 mm)» y la caja no cambia.
7. **Given** un valor menor de 5 mm de ancho o alto, o un QR no cuadrado, **When** se confirma, **Then** se rechaza con «El mínimo es 5 mm de ancho y de alto» o «El QR debe ser cuadrado».
8. **Given** el imán activo (por defecto), **When** se arrastra cerca del borde, centro, margen de seguridad o la otra caja, **Then** la caja se imanta dentro de 6 px de pantalla y se dibuja una guía.
9. **Given** el QR y el texto solapados, **When** se muestra el editor, **Then** aparece «El QR se solapa con el bloque de texto.» con un tinte rojo y [Ajustar bloque de texto], que acorta el bloque para que termine 1 mm sobre el QR.

---

### User Story 3 - Presets, ámbito y restablecer posición (Priority: P2)

Se coloca el QR con presets (Abajo centrado, Abajo izquierda, Abajo derecha, Centro; «Personalizado» tras un arrastre), y el cambio se aplica a todas las piezas o solo a la visible.

**Why this priority**: acelera el caso común, pero se puede lograr con coordenadas.

**Independent Test**: `PreviewScreen.test.tsx` («presets del QR…», «Solo esta pieza…») y `src/components/editor/editor-actions.test.ts`.

**Acceptance Scenarios**:

1. **Given** el preset «Centro», **When** se elige, **Then** el QR conserva su tamaño, se mueve al centro y, si solapa, avisa.
2. **Given** «Solo esta pieza», **When** se mueve una caja, **Then** solo cambia esa pieza (override) y aparece «Restablecer esta pieza a la posición común».
3. **Given** «Todas las piezas» con piezas personalizadas, **When** se edita, **Then** aparece «N piezas tienen posición personalizada…» con [Aplicar también a ellas].
4. **Given** el historial, **When** se pulsa Deshacer/Rehacer (o Ctrl/⌘ + Z y Mayús + Ctrl/⌘ + Z), **Then** se restauran posición, ajustes de plantilla y opciones de exportación, nunca los datos de las piezas.

---

### User Story 4 - Ajustes de plantilla y color de fondo (Priority: P2)

El panel «Plantilla» edita texto, tamaño, margen superior, alineación, peso, color y ocultar de cada línea, la zona de silencio y el color del QR, y el «Fondo de la pieza». [Restablecer a la plantilla] vuelve a los valores de la plantilla.

**Why this priority**: personaliza la salida sin cambiar el código, pero la plantilla base ya produce una pieza válida.

**Independent Test**: `editor-actions.test.ts` («un override de plantilla inválido…») y `PreviewScreen.test.tsx`.

**Acceptance Scenarios**:

1. **Given** un peso no declarado en la plantilla, **When** se aplica, **Then** `resolveTemplate` lo rechaza, se muestra el motivo y no se guarda.
2. **Given** un valor igual al de la plantilla, **When** se confirma, **Then** el override se elimina en lugar de duplicar el valor.
3. **Given** el color de fondo, **When** se cambia, **Then** se guarda en `templateOverrides.tile.background` y se redibuja la pieza.
4. **Given** ajustes personalizados, **When** se pulsa [Restablecer a la plantilla], **Then** `templateOverrides` queda vacío; el botón está deshabilitado si no hay ajustes.

---

### User Story 5 - Vista previa y detalle de pieza con descarga de SVG (Priority: P2)

La vista previa de cada pieza la dibuja el servidor con el texto en contornos; el detalle de pieza en `/editor` y la barra de `/preview` ofrecen «Descargar SVG».

**Why this priority**: la fidelidad de la pieza manda (PRODUCT.md); la vista previa debe coincidir con la salida.

**Independent Test**: `src/server/preview/render-tiles.test.ts`, `tests/e2e/preview.spec.ts` («se redibuja en el servidor…») y `tests/e2e/builder-acceptance.spec.ts` (SVG de 70 × 70 mm).

**Acceptance Scenarios**:

1. **Given** una posición nueva, **When** se confirma, **Then** la imagen del editor cambia a un nuevo `data:image/svg+xml` del servidor.
2. **Given** una pieza con QR pendiente, **When** se descarga su SVG, **Then** no se descarga y se avisa que se resuelva el QR.
3. **Given** una pieza lista, **When** se descarga, **Then** el SVG es de 70 × 70 mm, vectorial, con texto en contornos y un solo trazado de QR.
4. **Given** una petición de vista previa, **When** el QR está sin resolver, **Then** la vista previa no genera ni sube nada; usa el QR del link del menú o un marcador.

---

### User Story 6 - Accesible y usable en móvil (Priority: P3)

Toda pantalla funciona con teclado y lector de pantalla, y en 390 × 844 no hay desbordamiento horizontal.

**Why this priority**: el uso principal es de escritorio, pero el criterio de aceptación incluye móvil.

**Independent Test**: `tests/e2e/stepper.spec.ts` (móvil) y `tests/e2e/builder.spec.ts` («responsive»), proyectos `desktop` y `mobile` de `playwright.config.ts`.

**Acceptance Scenarios**:

1. **Given** viewport 390 × 844, **When** se visitan `/editor`, `/import`, `/preview` y `/export`, **Then** se ve «Paso N de 3» y `scrollWidth − innerWidth ≤ 0`.
2. **Given** móvil, **When** se abre el formulario de pieza, **Then** el diálogo ocupa todo el ancho.
3. **Given** el editor, **When** se enfoca una caja, **Then** su `aria-label` indica coordenadas y tamaño en mm.

### Edge Cases

- Sin selección válida se muestra y edita la primera pieza.
- Otra pestaña escribiendo: la pestaña queda en solo lectura (Deshacer, coordenadas y manejadores deshabilitados) con «Esta pestaña está en solo lectura: la otra pestaña es la que edita.».
- Plantilla desconocida: «La plantilla «{id}» ya no existe. Elige otra en la sección Plantilla.».
- Se rechazan valores fuera de rango; no existen correcciones silenciosas. Las coordenadas se guardan con 3 decimales para conservar medidas como 24,788 mm.
- Fuera del margen de seguridad (2 mm en `tropical-table`) se avisa con «Un elemento queda dentro del margen de seguridad de la pieza.».
- Fuentes de las piezas ausentes en el servidor: la vista previa responde 503 `FONTS_MISSING`.
- Hasta 48 piezas por petición de vista previa; el cliente parte lotes mayores.
- Cambiar de plantilla y escribir el nombre del archivo no crean pasos de deshacer.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La interfaz DEBE ofrecer tres pasos con rutas `/editor`, `/preview` y `/export`; `/import` DEBE ser parte del paso 1 y `/` NO DEBE mostrar el Stepper.
- **FR-002**: Los pasos 2 y 3 DEBEN estar bloqueados sin piezas o durante la generación; cada pantalla DEBE tener un único `h1` con «Paso N de 3».
- **FR-003**: En pantallas pequeñas el Stepper DEBE resumirse en «Paso N de 3» sin desbordar.
- **FR-004**: `/preview` DEBE mostrar la pieza dibujada por el servidor con una capa SVG de manejadores en mm (`viewBox` con 8 mm de margen para reglas).
- **FR-005**: Arrastre y flechas DEBEN acotar la caja a la pieza; valores escritos fuera de rango, menores de 5 mm o QR no cuadrado DEBEN rechazarse con mensaje.
- **FR-006**: Cada confirmación (soltar, Enter, flecha, preset) DEBE ser una sola entrada de deshacer (máximo 100 pasos).
- **FR-007**: El imán DEBE usar bordes y centro de la pieza, margen de seguridad y la otra caja, con umbral de 6 px de pantalla.
- **FR-008**: DEBE haber rejilla opcional de 1, 2 o 5 mm y reglas en mm.
- **FR-009**: DEBEN existir los presets del QR de §S4 y detección de «Personalizado» con tolerancia de 0,05 mm.
- **FR-010**: El editor DEBE avisar solapes y elementos dentro del margen de seguridad, y los avisos de composición del servidor.
- **FR-011**: El ámbito «Todas» DEBE escribir en la base del layout y «Solo esta pieza» en el override de la pieza.
- **FR-012**: El proyecto DEBE guardar `templateOverrides` (texto, tamaño, alineación, color, peso, margen superior, ocultar, zona de silencio y color del QR, fondo) validados con `resolveTemplate`.
- **FR-013**: `POST /api/preview/tiles` DEBE devolver piezas con texto en contornos y ejecutar las guardas de `withApiGuards` (Content-Type JSON, límite 600/min por defecto, cuerpo ≤ 1 MB).
- **FR-014**: La vista previa NUNCA DEBE generar ni subir un QR.
- **FR-015**: El detalle de pieza DEBE mostrar «Pieza N de M», sus datos, estado del QR y [SVG]; `/preview` DEBE ofrecer «Descargar SVG de esta pieza».
- **FR-016**: La interfaz DEBE ser operable con teclado, tener enlace «Saltar al contenido», foco visible y objetivos de 44 px con puntero grueso, y respetar `prefers-reduced-motion`.
- **FR-017**: MUI DEBE dar estilo a los componentes solo mediante el tema y Tailwind solo a layout; el lint DEBE prohibir colores literales en `sx` y `style` de `src/components/**`.
- **FR-018**: Gotham DEBE usarse solo en la interfaz; las piezas usan Address Sans Pro Cd.
- **FR-019**: `DESIGN.md` y `PRODUCT.md` DEBEN describir el sistema visual y el producto (skill Impeccable en `.claude/skills/impeccable`).

### Key Entities

- **ProjectLayout** (`base` + `overrides` por pieza) y **Layout** (cajas `qr` y `content` en mm).
- **TemplateOverrides** (`items`, `qr`, `tile`) del proyecto.
- **EditorUiState** (`scope`, `box`, `showGrid`, `gridMm`, `snap`, `unit`), solo de sesión.
- **PreviewRequest / PreviewResponse**: piezas mínimas y SVG con avisos.
- **EditorHistory**: pila de hasta 100 instantáneas de diseño.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El flujo de tres pasos pasa en escritorio y móvil (`tests/e2e/stepper.spec.ts`, 4 tests).
- **SC-002**: Arrastre, Esc, límites, redimensionado, teclado, ámbito y redibujado del servidor pasan en escritorio (`tests/e2e/preview.spec.ts`, 7 tests de «arrastre real»).
- **SC-003**: La geometría pura (clamp, move, resize, snap, presets, avisos) tiene tests sin DOM (`src/lib/layout/geometry.test.ts`) y las acciones del editor los suyos (`editor-actions.test.ts`, `PreviewScreen.test.tsx`: 9 tests).
- **SC-004**: Con 1000 piezas el DOM tiene ≤ 300 `<path>` y menos de 15 hojas (`tests/e2e/preview.spec.ts`, escritorio).
- **SC-005**: En 390 × 844 no hay scroll horizontal en las cuatro pantallas del flujo (`stepper.spec.ts`).
- **SC-006**: La vista previa del servidor produce SVG de 70 mm, sin texto vivo y sin inyección de marcado (`src/server/preview/render-tiles.test.ts`; se omite sin la fuente de las piezas).
- **SC-007**: La suite completa (917 tests) pasa.

## Assumptions

- El equipo trabaja sobre todo en escritorio (PRODUCT.md); el arrastre fino se valida solo en escritorio.
- La plantilla de trabajo es `tropical-table` (70 × 70 mm, margen 2 mm) y su fuente se instala con `bun run fonts:setup`.
- Un solo escritor por proyecto (bloqueo de pestaña) y persistencia en IndexedDB, descritos en §S6.
- El tema oscuro no está implementado; el tema declara que se añadirá en la Fase 12.

## Pendientes

- No verificado: la matriz §S12 dice que `/preview` es de solo lectura en móvil; el código no lo impone (solo hay solo lectura por otra pestaña) y `preview.spec.ts` omite el arrastre en móvil porque «hay campos de coordenadas».
- No verificado: contraste AA, uso con lector de pantalla real y la licencia web de Gotham (PRODUCT.md: «licencia web sin verificar»).
- Pendiente de §1.2-29: que cambiar de plantilla sea un paso de deshacer.
- Fuera de alcance: guías arrastradas desde la regla y zoom del editor.
- Textos obsoletos: el comentario de `src/app/api/preview/tiles/route.ts` habla de «contornos de Gotham»; las piezas usan Address Sans Pro Cd.
