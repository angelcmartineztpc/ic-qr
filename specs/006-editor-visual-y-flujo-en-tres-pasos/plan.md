# Implementation Plan: Editor visual y flujo en tres pasos

**Branch**: `006-editor-visual-y-flujo-en-tres-pasos` (retrospectiva) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Resumen

La interfaz se organiza en tres pasos (Piezas, Diseño, Exportar) con un Stepper accesible y un pie de página fijo. El paso Diseño (`/preview`) es un editor SVG en mm sobre la pieza dibujada por el servidor: la geometría es pura y probada sin DOM (`src/lib/layout`), el estado vive en stores de zustand con historial propio, y la vista previa se pide por lotes a `POST /api/preview/tiles`. El sistema visual es MUI por tema más Tailwind para layout, con Gotham solo en la interfaz.

## Contexto técnico

- **Lenguaje/versión**: TypeScript estricto; Next.js 16.3.8 (App Router), React 19.2.8.
- **Dependencias principales**: `@mui/material` ^9.4.0 con `@mui/material-nextjs`, `@emotion/*`, Tailwind v4 (`@tailwindcss/postcss`), `zustand` ^5, `idb-keyval`, `@tanstack/react-virtual` (visor del PDF), `@dnd-kit/*` (reordenar en `/editor`), Zod ^4.6.5. `zundo` está declarado, pero el historial del editor es propio (`EditorHistory`).
- **Almacenamiento**: IndexedDB en el cliente; el servidor solo lee instantáneas de QR existentes para la vista previa.
- **Pruebas**: Vitest (proyectos `unit`, `dom`, `integration`, `bun run test`) y Playwright (`bun run test:e2e`) con proyectos `desktop` (Desktop Chrome) y `mobile` (Pixel 7, viewport 390 × 844), servidor de producción en el puerto 3100.
- **Plataforma**: navegador moderno con `getScreenCTM` y Pointer Events; servidor Node 24.
- **Rendimiento**: 1000 piezas con ≤ 300 `<path>` y menos de 15 hojas en el DOM (virtualización); vista previa en lotes de hasta 48.
- **Restricciones**: no corregir en silencio, una entrada de deshacer por confirmación, UI en español, WCAG AA como objetivo (PRODUCT.md).

## Constitution Check

- **I. Una sola fuente de verdad y capas**: cumple. Geometría y layout en `src/lib/layout` (puro); acciones en `src/components/editor`; el servidor dibuja con el mismo `buildScene`/`renderSceneSvg` que el PDF; ningún componente importa `src/server/**` (regla ESLint `no-restricted-imports`).
- **II. Regla crítica del QR**: cumple. La vista previa nunca genera ni sube un QR; con `generated` dibuja su payload y con `existing` su instantánea o un marcador (`previewQrGeometry`, con tests).
- **III. Link estable del QR**: no aplica a esta feature; la comparte con la 007 solo en el campo del link de la pieza.
- **IV. Salida vectorial verificable**: cumple. La vista previa y «Descargar SVG» usan el mismo renderizador; el SVG se muestra como `<img>` (no ejecuta nada) y el test de render comprueba 70 mm, contornos y que el texto del usuario no inyecta marcado.
- **V. Validación en cada frontera y nada silencioso**: cumple. `setBox` y `setTemplateOverrides` rechazan con mensaje; la petición de vista previa se valida con Zod estricto (400 con issues); mensajes en español.
- **VI. Seguridad por defecto**: cumple. `/api/preview/tiles` usa `withApiGuards` con límite y tamaño; Gotham y las fuentes de las piezas no llegan al navegador (el servidor entrega SVG).
- **VII. Tests y calidad**: cumple con matiz. Hay tests de geometría, acciones, pantalla y E2E; falta test de integración de la ruta de vista previa y de contraste/lector de pantalla.

## Estructura del proyecto

```text
src/app/
├── page.tsx                 # Inicio: retoma o empieza (sin Stepper)
├── editor/page.tsx          # paso 1 · EditorScreen
├── import/page.tsx          # parte del paso 1 · ImportScreen
├── preview/page.tsx         # paso 2 · PreviewScreen
├── export/page.tsx          # paso 3 · ExportScreen
├── layout.tsx, globals.css  # fuente de la interfaz (Gotham) y tokens Tailwind
├── _providers/theme.ts      # tema MUI único (cssVariables)
└── api/preview/tiles/route.ts
src/components/
├── ui/                      # AppShell, WizardSteps, StepHeader, StepFooter, Panel, steps.ts…
├── editor/                  # PreviewScreen, LayoutEditor, CoordinatesPanel, PositionControls,
│                            # TemplatePanel, TemplatePicker, NumberField, editor-actions.ts,
│                            # useEditorActions.ts (+ ExportScreen, PdfViewer, PdfOptionsPanel…)
├── preview/                 # TilePreview, useTile
└── records/RecordDetail.tsx # detalle de pieza y «SVG»
src/lib/layout/              # geometry, presets, resolve-layout, warnings (+ geometry.test.ts)
src/lib/state/               # project.ts, stores.ts, history.ts, StoreProvider.tsx
src/lib/app/tile-preview-client.ts
src/schemas/preview.ts
src/server/preview/render-tiles.ts (+ test)
tests/e2e/{stepper,preview,builder,builder-acceptance}.spec.ts
playwright.config.ts
DESIGN.md, PRODUCT.md, .claude/skills/impeccable
```

**Decisión de estructura**: el SVG del editor usa `viewBox` en mm (`-8 -8 W+16 H+16`), no en décimas como decía §S4; durante el arrastre solo se mueve la capa de manejadores y al soltar se hace un commit y se vuelve a pedir la pieza al servidor.

## Decisiones y diferencias respecto a docs/ARCHITECTURE.md

- Historial propio `EditorHistory` (100 pasos) en lugar de `zundo`.
- `/preview` no reordena piezas (navegación ‹ ›, «Ir a» y «Pieza N de M»); reordenar sigue en `/editor`.
- Las opciones del PDF y el visor se movieron a `/export` en la reorganización en tres pasos; §S4 todavía las lista dentro de `/preview`.
- El visor del PDF dibuja las piezas reales (no recuadros); detalle en las «Notas del visor del PDF».
- Tokens: el tema MUI define los colores (`#1f5c4d` primario, `#9a4f00` advertencia, fondo `#f5f6f4`) y `globals.css` los mapea a Tailwind (`@theme inline`). Los SVG del editor usan literales de color en atributos (no en `sx`/`style`), que el lint no cubre.

## Riesgos

- `reuseExistingServer` en Playwright reutiliza un servidor viejo del puerto 3100 y puede dar 429 al azar (nota de la Fase 8).
- El motor táctil de Playwright no abre un `Select` de MUI con `click()`; las pruebas usan foco + Enter.
- Matriz responsive (§S12) y comportamiento real de `/preview` en móvil discrepan (ver Pendientes del spec).
