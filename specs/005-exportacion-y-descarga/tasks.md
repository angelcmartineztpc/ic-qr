# Tasks: Exportación y descarga

**Input**: `/specs/005-exportacion-y-descarga/` (spec.md, plan.md, contracts/export-api.md). Tareas retrospectivas: `[x]` solo con archivo existente más test o commit; `[ ]` es una verificación manual pendiente.

**Formato**: `[ID] [P?] [Historia] Descripción con ruta`

## Fase 1: Base compartida

- [x] T001 Esquemas `PDFOptionsSchema`, `PDF_DEFAULTS`, `ExportOptionsSchema` y `ExportRequestSchema` en `src/schemas/pdf.ts` y `src/schemas/export.ts` (test: `src/schemas/schemas.test.ts`, `tests/integration/export.test.ts`; commits `f794758`, `213e56e`)
- [x] T002 [P] Protocolo de tramas `encodeFrame`, `decodeFrame` y `readFrames` en `src/lib/export/frames.ts` (test: `src/lib/export/frames.test.ts`; commit `213e56e`)
- [x] T003 [P] Nombre de archivo y entradas del ZIP en `src/lib/export/file-name.ts` (test: `src/lib/export/file-name.test.ts`)

## Fase 2: Historia 1 — Descargar el PDF con progreso (P1)

- [x] T004 [US1] Generación en el servidor (`prepareExport`, `runExport`) en `src/server/export/run-export.ts` (test: `tests/integration/export.test.ts`; commit `213e56e`)
- [x] T005 [US1] Route Handler con `withApiGuards`, stream y semáforo en `src/app/api/export/route.ts` (test: `tests/integration/export.test.ts`, guardas y `inUse`)
- [x] T006 [P] [US1] Proyección del proyecto al cuerpo en `src/lib/export/build-request.ts` (test: `src/lib/export/build-request.test.ts`)
- [x] T007 [US1] Cliente del stream `runExportJob` en `src/lib/export/client.ts` y `saveBlob` en `src/lib/export/save-blob.ts` (test: `src/lib/export/client.test.ts`; commit `9153386`)
- [x] T008 [US1] Flujo «Descargar PDF» en `src/components/editor/export-actions.ts` y `useExportActions.ts` (test: `src/components/editor/export-actions.test.ts`)
- [x] T009 [P] [US1] Progreso y estado en `src/components/editor/DownloadProgress.tsx` y `GenerationStatus.tsx`; `beforeunload` en `src/lib/state/StoreProvider.tsx` (test: `tests/e2e/export.spec.ts`, «beforeunload»)
- [x] T010 [US1] Pantalla del paso 3 en `src/components/editor/ExportScreen.tsx` y `src/app/export/page.tsx` (test: `src/components/editor/ExportScreen.test.tsx`; commit `d4892ce`)

## Fase 3: Historia 2 — Formato del PDF (P1)

- [x] T011 [US2] Panel de opciones con resultado de `packGrid` en vivo en `src/components/editor/PdfOptionsPanel.tsx` (test: `src/components/editor/ExportScreen.test.tsx`)
- [x] T012 [P] [US2] Campo del nombre del archivo en `src/components/editor/FileNameInput.tsx` (test: `ExportScreen.test.tsx`, «el nombre del archivo muestra el predeterminado»)

## Fase 4: Historia 3 — Texto vivo por defecto e Illustrator (P1)

- [x] T013 [US3] `textMode: "live"` por defecto en `src/schemas/pdf.ts`, `src/schemas/export.ts` (`svg`) y `src/lib/state/project.ts`; ayudas en `PdfOptionsPanel.tsx` (test: `tests/integration/export.test.ts`, «con los valores por defecto el texto es vivo»; commit `3055c2e`)
- [x] T014 [P] [US3] Guía de apertura (Abrir, no Colocar) en `docs/ILLUSTRATOR.md` y muestras en `scripts/render-sample.mts` (commit `3055c2e`)
- [ ] T015 [US3] Abrir el PDF y el SVG exportados en Illustrator con `scripts/illustrator-check.jsx` (manual; el script hoy solo acepta mesas de 50 × 50, 210 × 297 o 215.9 × 279.4 mm)

## Fase 5: Historia 4 — ZIP de SVG (P2)

- [x] T016 [US4] ZIP en streaming con `fflate` en `src/server/export/zip.ts` (test: `tests/integration/export.test.ts`, numeración 1…n y nombre por área y mesa)
- [x] T017 [P] [US4] Botón «Descargar ZIP» y opción de nombre de cada SVG en `PdfOptionsPanel.tsx` y `ExportScreen.tsx` (test: `tests/e2e/export.spec.ts`, «con ZIP»; `ExportScreen.test.tsx`)

## Fase 6: Historias 5 y 6 — Cancelar, fallos, bloqueos (P2)

- [x] T018 [US5] Cancelación y tiempo máximo en el servidor y el cliente (test: `tests/integration/export.test.ts`, «cancelar a mitad» y «tiempo máximo»; `client.test.ts`, «cancelar»)
- [x] T019 [P] [US5] Errores del cliente con mensajes en español y [Reintentar] en `src/components/editor/export-actions.ts` (test: `export-actions.test.ts`, «errores y cancelación»; `tests/e2e/export.spec.ts`, «cancelar, cortes y errores»)
- [x] T020 [US6] Diálogo de bloqueos en `src/components/editor/ExportBlockersDialog.tsx`, exclusión de sesión y confirmación de solapes (test: `export-actions.test.ts`, «QR pendientes y bloqueos»)
- [x] T021 [US6] Identidad del QR y solo lectura del storage (test: `tests/integration/export.test.ts`, «no sube nada ni crea QR» y «identidad del QR»)
- [x] T022 [P] Límites y drenaje: 429 `BUSY`, 413, 503 `DRAINING` y `FONTS_MISSING` (test: `tests/integration/export.test.ts`)

## Fase 7: Historia 7 — Visor y SVG de una pieza (P3)

- [x] T023 [US7] Visor `PdfViewer` con miniaturas, zoom, páginas y teclado en `src/components/editor/PdfViewer.tsx` (test: `src/components/editor/PdfViewer.test.tsx`; commit `0a4cffe`)
- [x] T024 [P] [US7] «Descargar SVG de esta pieza» (`downloadPieceSvg`) en `src/components/records/builder-actions.ts`, `RecordCard.tsx` y `src/components/editor/PreviewScreen.tsx` (test: `src/components/records/builder-actions.test.ts`)
- [x] T025 Descarga de 1000 piezas con 167 páginas en `tests/e2e/export-1000.spec.ts` (escrito; su ejecución no se repitió para esta documentación)
- [ ] T026 Probar la descarga de Blobs grandes en otros navegadores y que el ZIP ofrecido aparte no se bloquee (manual)

## Evidencia

Comandos (solo lectura; el caller informó 917 tests en verde): `bun run test`, `bun run test:e2e`, `bun run lint`, `bun run typecheck`.

Commits (`git log --oneline`):

- `213e56e` feat: fase 9 — exportación en el servidor (POST /api/export)
- `9153386` feat: fase 10 — descarga del PDF con progreso y cancelación
- `d4892ce` feat: interfaz en tres pasos (Piezas → Diseño → Exportar)
- `0a4cffe` feat: visor del PDF al estilo de un lector (paso Exportar)
- `3055c2e` feat: exportar con texto vivo por defecto para poder editarlo en Illustrator
