# Tasks: Editor visual y flujo en tres pasos

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/preview-tiles.md](contracts/preview-tiles.md)

**Estado**: retrospectiva; `[x]` solo con archivo existente y test o commit que lo respalda. Rutas relativas a la raíz del repositorio.

## Fase 1: Base de interfaz y sistema visual

- [x] T001 Tema MUI único con `cssVariables`, paleta, foco visible y objetivos táctiles de 44 px en `src/app/_providers/theme.ts`
- [x] T002 [P] Tokens Tailwind mapeados al tema, breakpoints, `prefers-reduced-motion` y `.skip-link` en `src/app/globals.css`
- [x] T003 [P] Gotham solo para la interfaz con `next/font/local` (`lang="es"`) en `src/app/layout.tsx`
- [x] T004 [P] Regla ESLint contra colores literales en `sx`/`style` de `src/components/**` en `eslint.config.mjs`
- [x] T005 [P] Documentar el sistema visual y el producto en `DESIGN.md` y `PRODUCT.md`; skill Impeccable en `.claude/skills/impeccable`

## Fase 2: Historia 1 — Flujo en tres pasos (P1)

- [x] T006 [US1] Definir `STEPS` y `StepIndex` en `src/components/ui/steps.ts`
- [x] T007 [US1] `WizardSteps` accesible (`aria-current="step"`, pasos 2 y 3 bloqueados sin piezas o generando, «Paso N de 3» en móvil) en `src/components/ui/WizardSteps.tsx`
- [x] T008 [P] [US1] `AppShell`, `StepHeader`, `StepFooter` y `Panel` en `src/components/ui/`
- [x] T009 [US1] Páginas `/`, `/editor`, `/import`, `/preview` y `/export` en `src/app/*/page.tsx`
- [x] T010 [US1] Test E2E del flujo, pasos bloqueados, móvil e importación en `tests/e2e/stepper.spec.ts`

## Fase 3: Historia 2 — Mover y redimensionar (P1)

- [x] T011 [US2] Geometría pura (`clampBox`, `moveBox`, `resizeBox`, `snapTargets`, `snapBox`, `nudge`, `boxesOverlap`) en `src/lib/layout/geometry.ts`
- [x] T012 [P] [US2] Tests de geometría sin DOM en `src/lib/layout/geometry.test.ts`
- [x] T013 [US2] `LayoutEditor` SVG con manejadores, reglas, rejilla, guías de imán, Esc y teclado en `src/components/editor/LayoutEditor.tsx`
- [x] T014 [US2] `CoordinatesPanel` y `NumberField` (mm/cm, valida al salir o con Enter) en `src/components/editor/`
- [x] T015 [US2] Acciones `setBox`, historial de 100 pasos y rechazo con mensaje en `src/components/editor/editor-actions.ts` y `src/lib/state/history.ts`
- [x] T016 [P] [US2] Tests de acciones en `src/components/editor/editor-actions.test.ts` y de historial en `src/lib/state/history.test.ts`
- [x] T017 [US2] Pantalla `PreviewScreen` (barra, deshacer/rehacer, atajos, avisos) en `src/components/editor/PreviewScreen.tsx` con test en `PreviewScreen.test.tsx`
- [x] T018 [US2] E2E de arrastre real, Esc, límites, esquinas y teclado en `tests/e2e/preview.spec.ts`

## Fase 4: Historia 3 — Presets, ámbito y restablecer (P2)

- [x] T019 [US3] Presets y `detectPreset` en `src/lib/layout/presets.ts`
- [x] T020 [US3] `QrPresetPicker`, `ScopeSwitch` y `OverlapAlert` en `src/components/editor/PositionControls.tsx`
- [x] T021 [US3] `resolveLayout`, `applyLayoutChange`, `resetOverride` y `pruneLayoutOverrides` en `src/lib/layout/resolve-layout.ts`
- [x] T022 [US3] `fitContentAboveQr` y `applyBaseToCustomized` en `editor-actions.ts` y `src/lib/state/project.ts`

## Fase 5: Historia 4 — Ajustes de plantilla (P2)

- [x] T023 [US4] `TemplateOverridesSchema` en `src/schemas/template.ts`
- [x] T024 [US4] `TemplatePanel` con color de QR, fondo de la pieza y [Restablecer a la plantilla] en `src/components/editor/TemplatePanel.tsx`
- [x] T025 [P] [US4] `TemplatePicker` en `src/components/editor/TemplatePicker.tsx`; `setTemplateOverrides` valida con `resolveTemplate` (test «un override de plantilla inválido…» en `editor-actions.test.ts`)
- [ ] T026 [US4] Que cambiar de plantilla sea un paso de deshacer (pendiente declarado en §S4/Fase 8, §1.2-29)

## Fase 6: Historia 5 — Vista previa del servidor y detalle de pieza (P2)

- [x] T027 [US5] `PreviewRequestSchema` en `src/schemas/preview.ts`
- [x] T028 [US5] `renderPreviewTiles` y `previewQrGeometry` en `src/server/preview/render-tiles.ts`, con tests en `render-tiles.test.ts`
- [x] T029 [US5] Ruta `POST /api/preview/tiles` con `withApiGuards` en `src/app/api/preview/tiles/route.ts`
- [x] T030 [US5] Cliente por lotes y caché en `src/lib/app/tile-preview-client.ts` (+ test), `useTile` y `TilePreview` en `src/components/preview/`
- [x] T031 [US5] Detalle de pieza con [SVG] en `src/components/records/RecordDetail.tsx` y `downloadPieceSvg` en `src/components/records/builder-actions.ts`
- [x] T032 [US5] E2E del SVG de 70 × 70 mm en `tests/e2e/builder-acceptance.spec.ts`
- [ ] T033 [US5] Test de integración de la ruta `/api/preview/tiles` (guardas, 400, 503): no existe

## Fase 7: Historia 6 — Accesibilidad y responsive (P3)

- [x] T034 [US6] `aria-label` con coordenadas, `role="group"`, `touch-action: none` en `src/components/editor/LayoutEditor.tsx`
- [x] T035 [P] [US6] Proyecto Playwright `mobile` (Pixel 7, 390 × 844) en `playwright.config.ts`; E2E sin desbordamiento en `tests/e2e/stepper.spec.ts` y `tests/e2e/builder.spec.ts`
- [ ] T036 [US6] `/preview` de solo lectura en móvil según §S12 (el código no lo impone; decidir si se implementa o se corrige el documento)
- [ ] T037 [US6] Auditoría de contraste AA y prueba con lector de pantalla real (no verificado)

## Dependencias

- T006 precede a T007 y T009; T011 precede a T013, T015 y T019.
- T023 precede a T024 y T025; T027 precede a T028 y T029.
- T029 y T030 preceden a T013 en uso (imagen del editor), no en compilación.

## Evidencia

- Comandos: `bun run lint && bun run typecheck && bun run test && bun run build` (917 tests pasan según el cierre); `bun run test:e2e` (Playwright, requiere `bun run fonts:setup`). No se ejecutaron al documentar.
- Commits (`git log --oneline`):
  - `5b8d4c4` feat: fase 8 — editor visual (/preview)
  - `d4892ce` feat: interfaz en tres pasos (Piezas → Diseño → Exportar)
  - `0a4cffe` feat: visor del PDF al estilo de un lector (paso Exportar)
  - `184f3f3` feat: pulido de pantallas con Impeccable live (detalle de pieza y barra de Diseño)
  - `fdcf9de` chore: guardar el resto del trabajo en curso (tema de la UI y skill Impeccable)
  - `d9a22b1` feat: importar CSV, link del menú común y Gotham solo en la interfaz
  - `76093b2` feat: pieza idéntica a la referencia (Address Sans Pro Cd, 70 × 70 mm, marco, #2C2E35)
  - `7f2f541` feat: tinta de las piezas en negro puro #000000 (RGB)
  - `57d20a1` fix: tests de «Descargar SVG» al menú de la tarjeta y lint sin carpetas de skills
