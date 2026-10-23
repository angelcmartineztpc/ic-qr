# Feature Specification: Rediseño UX/UI Unificado (4 Fases) y Despliegue Persistente en Cloudflare Workers

**Feature Branch**: `013-rediseno-ux-ui-y-despliegue-cloudflare`

**Created**: 2026-10-19

**Status**: Implemented & Deployed (`https://qr-production-generator.angelcmartinez.workers.dev`)

**Input**: Auditoría y rediseño UX/UI completo de todas las pantallas (estilo Linear / Figma + Material 3 Expressive), identidad corporativa `#274C69`, superficies tonales en modo oscuro (`#0a0e12` / `#121920` / `#1b242e` + `#6B9BC3`), accesibilidad WCAG AA y publicación en Cloudflare Workers con persistencia en `Cloudflare KV` (`QR_KV`) y fuentes de piezas embebidas.

## Contexto

La interfaz presentaba fragmentación visual entre tokens de MUI y Tailwind, triplicación del estado de guardado, banners que empujaban el layout verticalmente, cuatro filas de controles en `/editor`, exceso de botones primarios competidores en `RecordDetail` y un modo oscuro con azul genérico de Tailwind. Además, para compartir y probar el flujo completo (incluidos los QR dinámicos `/s/{código}`) sin depender de `localhost` ni requerir una suscripción de pago en R2, se habilitó el despliegue en Cloudflare Workers Free con respaldo persistente en **Cloudflare KV (`QR_KV`)** y empaquetado privado de la fuente de piezas (`AddressSansPro-CdSemibold.woff2`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sistema de Tokens, Color Corporativo `#274C69` y Modo Oscuro Tonal (Priority: P1)

La aplicación utiliza el color primario corporativo `#274C69` (RGB 39, 76, 105) tanto en modo claro como en botones sólidos del modo oscuro, mientras que el modo oscuro aplica superficies tonales Material 3 (`#0a0e12`, `#121920`, `#1b242e`) y la variante luminosa `#6B9BC3` para textos de acento, iconos y anillos de foco (`:focus-visible`) con contraste WCAG AA (`>= 6.48:1`).

**Acceptance Scenarios**:

1. **Given** cualquier pantalla en modo claro u oscuro, **When** se renderiza un botón primario sólido o chip activo, **Then** el fondo es `#274C69` con texto blanco `#ffffff`.
2. **Given** el modo oscuro activo, **When** se navega con `Tab` o se inspeccionan enlaces/iconos de acento, **Then** usan `#6B9BC3` sobre `#0a0e12` / `#121920` cumpliendo WCAG AA.

---

### User Story 2 - Marco Global Compacto y Toast No Intrusivo (Priority: P1)

El encabezado (`AppShell`), los pasos (`WizardSteps`) y los pies de página (`StepFooter`) son compactos, `ProjectBadge` es la única fuente de verdad del estado de guardado en el marco global y el aviso de proyecto restaurado (`PersistenceBanners`) aparece como notificación flotante (Toast) con autocierre de 5 s sin empujar el contenido.

**Acceptance Scenarios**:

1. **Given** un proyecto restaurado desde IndexedDB, **When** carga la pantalla, **Then** aparece un toast flotante en la esquina inferior derecha que no desplaza el layout y se cierra solo o con `✕`.
2. **Given** cualquier modal (`ModalLayout`, `ConfirmDialog`), **When** se abre, **Then** atrapa el foco del teclado, cierra con `Escape` y ubica `Cancelar` a la izquierda y el CTA primario a la derecha.

---

### User Story 3 - Rediseño del Editor (`/editor`) en 2 Niveles e Inspector Limpio (Priority: P1)

`BuilderToolbar` se organiza en 2 niveles limpios (Nivel 1: Nombre del proyecto + estado de guardado calmo a la izquierda, `+ Agregar nuevo`, `Importar Excel` y menú `⋯` a la derecha; Nivel 2: buscador + filtros tipo píldora a la izquierda, badge del Catálogo QR + selector de vista a la derecha). En `RecordDetail`, `Editar` es el único botón primario con texto y `Descargar SVG`, `Duplicar`, `Mover` y `Eliminar` son botones de icono cuadrados (`36×36px`, `44×44px` en móvil) con `Tooltip`.

**Acceptance Scenarios**:

1. **Given** la pantalla `/editor` con piezas cargadas, **When** se inspecciona una pieza, **Then** `Editar` destaca como acción primaria en forma de píldora y las acciones secundarias son botones de icono con `aria-label` y `Tooltip`.

---

### User Story 4 - QR Dinámicos (`/s/{código}`) y Fuentes en Cloudflare Workers sin `localhost` (Priority: P1)

Los links cortos (`/s/{código}`) y los SVG de los QR (`qr/v1/{sha256}.svg`) se almacenan de forma persistente en **Cloudflare KV (`QR_KV`)** cuando no existe el bucket R2 `QR_BUCKET`, permitiendo que cualquier celular escanee un QR dinámico y redirija al destino vigente (actualizable desde `Cambiar destino` sin reimprimir el QR). La fuente de piezas (`AddressSansPro-CdSemibold.woff2`) se empaqueta en el servidor durante el build sin exponerse públicamente.

**Acceptance Scenarios**:

1. **Given** una pieza creada en `https://qr-production-generator.angelcmartinez.workers.dev`, **When** se escanea su link `/s/{código}` desde otro dispositivo o tras reiniciar el Worker, **Then** responde `302 Found` hacia el destino vigente guardado en `QR_KV`.
2. **Given** un cambio de destino en `LinkDestination` (`PATCH /api/links/{código}`), **When** se vuelve a escanear el mismo QR, **Then** redirige al nuevo link actualizado sin cambiar el QR impreso.
3. **Given** las pantallas `/preview` y `/export` en Cloudflare Workers, **When** se solicita la vista previa o el PDF, **Then** el servidor traza `Address Sans Pro Cd Semibold` desde el respaldo embebido sin devolver `FONTS_MISSING`.


---

### User Story 5 - Cierre del flujo en Exportar (`/export`) (Priority: P2)

Al terminar una exportación (`generation.phase === "done"`), `ExportNextSteps` abre un modal «Exportación completada» y deja en la pantalla una sección «Siguiente paso» (`data-testid="next-steps"`) para reabrirlo con `Ver opciones`. Ofrece cuatro salidas: **Guardar proyecto (.qrproj)**, **Empezar un proyecto nuevo**, **Volver al Editor** (`/editor`) e **Ir al Dashboard** (`/`). La lógica de generación de PDF/SVG no cambia.

- Un solo CTA primario (`#274C69`): «Guardar proyecto» mientras haya cambios sin descargar (`isDirty`); una vez guardado, el primario pasa a «Empezar un proyecto nuevo». Las demás acciones son secundarias (contorno / texto).
- El modal usa `ModalLayout`: cierra con `Escape` y `✕`, atrapa el foco (MUI Dialog) y no se abre al volver a `/export` con un resultado viejo, solo al terminar una exportación.

**Acceptance Scenarios**:

1. **Given** una exportación recién terminada, **When** se muestra el resultado, **Then** aparece el modal con las cuatro opciones y, al cerrarlo, queda la sección «Siguiente paso».
2. **Given** cambios sin descargar, **When** se elige «Empezar un proyecto nuevo», **Then** `StartOverDialog` advierte la pérdida del progreso y ofrece descargar el `.qrproj` antes; `Cancelar` o `Escape` no borran nada.
3. **Given** el proyecto ya guardado, **When** se elige «Empezar un proyecto nuevo», **Then** se limpia el estado y se navega a `/` sin confirmación adicional.

**Pruebas**: `src/components/editor/ExportScreen.test.tsx` (cierre del flujo y confirmación con cambios sin descargar).
