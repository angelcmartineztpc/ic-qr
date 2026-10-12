# Tasks: Importación de Excel (.xlsx) y CSV

**Input**: Design documents from `/specs/003-importacion-excel-csv/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/import-excel.md

**Tests**: cada tarea cita el archivo de test que la respalda. Las tareas son retrospectivas: todas están marcadas `[x]` porque el archivo existe, su test pasa (917 tests en la suite) y el commit de origen figura en `git log`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se podía hacer en paralelo (archivos distintos)
- **[Story]**: US1 a US7 de spec.md

## Phase 1: Setup

- [x] T001 Instalar SheetJS desde su CDN y `fflate` en `package.json`; copiar el worker y `node_modules/xlsx` a la salida standalone con `outputFileTracingIncludes` en `next.config.ts`
- [x] T002 [P] Script de vigilancia de versión en `scripts/check-sheetjs.mts` (commit `005ba21`; sin test automático)
- [x] T003 [P] Esquemas y tipos del resultado de importación en `src/schemas/import.ts` y `src/types/import.ts` (test: `src/schemas/schemas.test.ts`, «X-Column-Mapping: ida y vuelta en base64url con UTF-8»)

## Phase 2: Foundational (bloquea las historias)

- [x] T004 Guard del contenedor `.xlsx` y reconstrucción del ZIP en `src/server/excel/upload-guard.ts` (test: `src/server/excel/upload-guard.test.ts`)
- [x] T005 Lectura de SheetJS aislada en un worker con límites en `src/server/excel/read-workbook.ts` y `src/server/excel/parse-worker.mjs` (test: `tests/integration/api-import.test.ts`, caso de `PARSE_TIMEOUT`)
- [x] T006 [P] Mensajes y estados HTTP de rechazo de archivo en `src/lib/excel/file-issues.ts` (test: `tests/integration/api-import.test.ts`, casos hostiles)
- [x] T007 [P] Tipos de hoja cruda y letras de columna en `src/lib/excel/types.ts`
- [x] T008 [P] `ImportIssue` a partir de un fallo de campo y duplicado de archivo en `src/lib/validation/import-issues.ts` (test: `src/lib/validation/validate.test.ts`, «produce el ImportIssue de §29 para un link inválido»)

## Phase 3: User Story 1 - Importar un `.xlsx` (P1)

- [x] T009 [US1] Detección de cabeceras, alias, erratas y elección de hoja en `src/lib/excel/headers.ts` (test: `src/lib/excel/headers.test.ts`)
- [x] T010 [P] [US1] Coerción de celdas en `src/lib/excel/coerce.ts` (test: `src/lib/excel/coerce.test.ts`)
- [x] T011 [US1] Tubería de filas a `ImportResult` en `src/lib/excel/import-pipeline.ts` (test: `src/lib/excel/import-pipeline.test.ts`)
- [x] T012 [US1] Orquestación servidor en `src/server/excel/import-excel.ts` (test: `tests/integration/api-import.test.ts`)
- [x] T013 [US1] Route Handler `POST /api/import/excel` en `src/app/api/import/excel/route.ts` (test: `tests/integration/api-import.test.ts`, «401, 415, 403 y 421 antes de leer el archivo»)
- [x] T014 [US1] Cliente HTTP y validación previa en `src/lib/app/import-client.ts` (test: `src/components/import/import-actions.test.ts`)
- [x] T015 [US1] Pantalla `/import`, resumen y listas en `src/app/import/page.tsx`, `src/components/import/ImportScreen.tsx`, `ImportSummary.tsx`, `IssueList.tsx` y `ExcelUploader.tsx` (test: `src/components/import/ImportScreen.test.tsx`)
- [x] T016 [US1] Creación de piezas en una sola mutación (`importRecords`) en `src/lib/state/project.ts` (test: `src/lib/state/project.test.ts`, «crea todas las piezas de golpe…»)

## Phase 4: User Story 2 - CSV (P1)

- [x] T017 [US2] Decodificación, separador y RFC 4180 en `src/lib/excel/csv.ts` (commit `d9a22b1`; test: `src/lib/excel/csv.test.ts`)
- [x] T018 [US2] Rama CSV de `importExcel` sin worker en `src/server/excel/import-excel.ts` (test: `tests/integration/api-import.test.ts`, «importa un CSV con comas, con BOM y con columnas extra (hotel)»)

## Phase 5: User Story 3 - Rechazo seguro (P1)

- [x] T019 [US3] Casos hostiles (bombas, EOCD falso, `.xls`, macros, plantillas) en `src/server/excel/upload-guard.test.ts` y `tests/integration/api-import.test.ts`
- [x] T020 [P] [US3] Prueba E2E de archivo hostil y de PDF renombrado en `tests/e2e/import.spec.ts`

## Phase 6: User Story 4 - Confirmar columnas (P2)

- [x] T021 [US4] Mapeo manual por cabecera `X-Column-Mapping` en `src/server/excel/import-excel.ts` y `src/app/api/import/excel/route.ts` (test: `tests/integration/api-import.test.ts`, «columna obligatoria ausente…»)
- [x] T022 [US4] Diálogo en `src/components/import/ColumnMappingDialog.tsx` y acción `applyColumnMapping` (test: `ImportScreen.test.tsx`, «sin la columna Mesa abre el diálogo de columnas…»)

## Phase 7: User Story 5 - Duplicados y modo (P2)

- [x] T023 [US5] Revisión en el cliente con la clave del proyecto en `src/lib/excel/review.ts` (test: `src/lib/excel/review.test.ts`)
- [x] T024 [US5] Selector de clave en `src/components/import/DuplicateKeyDialog.tsx` y lista de revisión en `src/components/import/DuplicateList.tsx` (test: `ImportScreen.test.tsx`, ««Revisar manualmente» muestra un interruptor por copia»)
- [x] T025 [US5] Acciones `setStrategy`, `setMode`, `changeDuplicateKey` y `confirm` en `src/components/import/import-actions.ts` (test: `src/components/import/import-actions.test.ts`)

## Phase 8: User Story 6 - Link del menú común (P2)

- [x] T026 [US6] Cabecera `X-Default-Menu-Url` y aviso `DEFAULT_MENU_URL_USED` en `src/app/api/import/excel/route.ts` y `src/lib/excel/import-pipeline.ts` (commit `d9a22b1`; test: `tests/integration/api-import.test.ts`, «con el Link del menú común…»)
- [x] T027 [US6] Campo y selector de resort en `src/components/import/ImportScreen.tsx` (sin test de DOM propio; cubierto indirectamente por T026)

## Phase 9: User Story 7 - Informe y persistencia (P3)

- [x] T028 [US7] Informe CSV protegido contra fórmulas en `src/lib/excel/error-report.ts` (test: `src/lib/excel/error-report.test.ts`)
- [x] T029 [P] [US7] Persistencia del último resultado en `src/lib/state/last-import.ts` (test: `ImportScreen.test.tsx`, «al recargar, el último resultado sigue ahí…»)
- [x] T030 [US7] Prueba E2E de 100 + 5, informe y recarga en `tests/e2e/import.spec.ts`

## Phase 10: Polish

- [x] T031 [P] Prueba opcional con libros reales en `tests/integration/real-workbooks.test.ts` (se omite sin archivos en `tests/fixtures/real/`)

## Dependencias

- T004–T008 bloquean las historias. US2 reutiliza T011; US5 reutiliza `src/lib/records/duplicates.ts` de la spec 001; US7 depende de T012.

## Evidencia

Comandos de verificación (la suite completa pasa con 917 tests según el encargo; no se re-ejecutó al redactar este documento):

```bash
bun run test                  # Vitest: unit, dom, integration (917 tests)
bun run test:e2e              # Playwright: tests/e2e/import.spec.ts
bun run check:sheetjs         # exit 0 al día, 2 versión nueva, 1 error de consulta
bun run lint && bun run typecheck
```

Commits relevantes (`git log --oneline`):

- `005ba21` feat: fase 4 — núcleo vectorial (añade `scripts/check-sheetjs.mts`)
- `90b0dbc` feat: fase 7 — importación de Excel
- `d9a22b1` feat: importar CSV, link del menú común y Gotham solo en la interfaz
- `d4892ce` feat: interfaz en tres pasos (Piezas → Diseño → Exportar) (`/import` pasa a ser parte del paso 1)
- `6da1e64` feat: link estable del QR por resort y servicio (origen de `ResortLinkPicker`, usado en `ImportScreen`)
