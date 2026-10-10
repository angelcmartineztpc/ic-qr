# Tasks: Registros de piezas y validación

**Input**: Design documents from `/specs/001-registros-y-validacion/`

**Prerequisites**: plan.md, spec.md, data-model.md

**Tests**: cada tarea cita el archivo de test que la respalda. Las tareas son retrospectivas: todas están marcadas `[x]` porque el archivo existe, su test pasa (917 tests en la suite) y el commit de origen figura en `git log`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se podía hacer en paralelo (archivos distintos)
- **[Story]**: US1 a US6 de spec.md

## Phase 1: Setup y modelo compartido

- [x] T001 Definir `QRRecord`, `QrSourceInfo`, `QrAck`, `ValidationIssue` y metadatos con Zod en `src/schemas/record.ts`; tipos inferidos en `src/types/record.ts` (test: `src/schemas/schemas.test.ts`)
- [x] T002 [P] Definir las URLs seguras (`SafeHttpUrlSchema`, `MenuUrlSchema`, `ExistingQrUrlSchema`) en `src/schemas/url.ts` (test: `src/lib/validation/validate.test.ts`)
- [x] T003 [P] Normalización única de texto en `src/lib/text/normalize.ts` (test: `src/lib/text/normalize.test.ts`)
- [x] T004 [P] Catálogo de mensajes en español en `src/lib/validation/messages.es.ts` (test: `validate.test.ts`, «reproduce las líneas exactas de la lista de errores»)

## Phase 2: Foundational (bloquea las historias)

- [x] T005 Validación estricta por campo y por registro (`checkField`, `validateDraft`, `validateRecord`) en `src/lib/validation/validate.ts` (test: `src/lib/validation/validate.test.ts`)
- [x] T006 Factoría y mutaciones de registros (`createRecord`, `updateRecordData`, `duplicateRecord`, `withDerived`) en `src/lib/records/factory.ts` (test: `src/lib/records/factory.test.ts`)
- [x] T007 Estado del proyecto como funciones puras en `src/lib/state/project.ts` y stores de zustand en `src/lib/state/stores.ts` (test: `src/lib/state/project.test.ts`)
- [x] T008 Esquemas del proyecto persistido y del archivo en `src/schemas/project.ts` (test: `src/schemas/schemas.test.ts`, «valida la envoltura y deja los registros para la hidratación tolerante»)

## Phase 3: User Story 1 - Alta y edición manual (P1)

- [x] T009 [US1] Validación en vivo del formulario (`validateForm`, avisos de http y de glifos) en `src/lib/validation/form.ts` (test: `src/lib/validation/form.test.ts`)
- [x] T010 [US1] Formulario manual con vista previa y aviso de duplicado en `src/components/forms/RecordForm.tsx` (test: `src/components/records/EditorScreen.test.tsx`, «el formulario valida los obligatorios y los campos son de texto libre»)
- [x] T011 [US1] Acciones `add` y `save` con las confirmaciones de Link del QR en `src/components/records/builder-actions.ts` (test: `src/components/records/builder-actions.test.ts`)
- [x] T012 [P] [US1] Selector de resort y servicio para rellenar el Link del menú en `src/components/forms/ResortLinkPicker.tsx` (commit `6da1e64`; sin test propio de esta feature)

## Phase 4: User Story 2 - Persistencia y cuarentena (P1)

- [x] T013 [US2] Hidratación tolerante por registro y `stripAcks` en `src/lib/records/hydrate.ts` (test: `src/lib/records/hydrate.test.ts`)
- [x] T014 [US2] Carga, copia de seguridad y autoguardado con debounce en `src/lib/state/persistence.ts` y adaptador IndexedDB en `src/lib/state/idb.ts` (test: `src/lib/state/persistence.test.ts`)
- [x] T015 [US2] `StoreProvider` con hidratación, vaciado en `pagehide` y `beforeunload` en `src/lib/state/StoreProvider.tsx` (test: `EditorScreen.test.tsx`, «los cambios se guardan en el navegador (IndexedDB)»)
- [x] T016 [US2] Avisos de restauración, cuarentena, copia de seguridad y IndexedDB no disponible en `src/components/records/PersistenceBanners.tsx` (test: `EditorScreen.test.tsx`, «la cuarentena ofrece Ver, Descargar y Descartar»)

## Phase 5: User Story 3 - Navegar, buscar y filtrar (P2)

- [x] T017 [US3] Contadores, filtros, búsqueda y paginación puros en `src/lib/state/counters.ts` (test: `src/lib/state/counters.test.ts`)
- [x] T018 [US3] Pantalla `/editor` en `src/components/records/EditorScreen.tsx`, `src/components/records/RecordCounters.tsx`, `src/components/records/BuilderToolbar.tsx` y `src/app/editor/page.tsx` (test: `EditorScreen.test.tsx`, «vista de rejilla con paginación … (1000 piezas…)»)
- [x] T019 [P] [US3] Prueba E2E de rejilla con 1000 piezas en `tests/e2e/builder-acceptance.spec.ts`

## Phase 6: User Story 4 - Duplicar, eliminar y reordenar (P2)

- [x] T020 [US4] Operaciones de orden (`moveTo`, `insertAfter`, `removeIds`, `sortOrder`, `repairOrder`, `materializeOrder`) en `src/lib/records/order.ts` y `src/lib/records/natural-sort.ts` (test: `src/lib/records/order.test.ts`)
- [x] T021 [US4] `deleteRecords`, `restoreRecords`, `duplicateRecordIn`, `moveRecord` y `sortRecords` en `src/lib/state/project.ts` (test: `src/lib/state/project.test.ts`)
- [x] T022 [US4] Acciones `remove`, `undoDelete`, `duplicate`, `move` y `sortBy` con confirmaciones en `src/components/records/builder-actions.ts` (test: `builder-actions.test.ts`)
- [x] T023 [P] [US4] Tira reordenable con puntero, táctil y teclado en `src/components/records/SortableStrip.tsx`, y diálogo «Mover a…» en `src/components/records/MoveToDialog.tsx` (test: `tests/e2e/builder.spec.ts`, «reordenar: «Mover a…» una posición y ordenar por mesa»)

## Phase 7: User Story 5 - Duplicados (P2)

- [x] T024 [US5] Clave configurable, grupos y estrategias Mantener, Eliminar y Revisar en `src/lib/records/duplicates.ts` (test: `src/lib/records/duplicates.test.ts`)
- [x] T025 [P] [US5] Clave de URL canónica sin fragmento en `src/lib/validation/url.ts` (test: `validate.test.ts`, «canoniza host y quita el fragmento, sin tocar path ni query»)

## Phase 8: User Story 6 - Archivo de proyecto y pestaña única (P3)

- [x] T026 [US6] Guardar y abrir `.qrproj.json` en `src/lib/state/project-file.ts` (test: `src/lib/state/project-file.test.ts`)
- [x] T027 [US6] Bloqueo de escritor único con Web Locks en `src/lib/state/tab-lock.ts` (test: `src/lib/state/tab-lock.test.ts`)
- [x] T028 [US6] Acciones `saveProjectFile`, `openProjectFromFile` y `newProject` con confirmación de cambios sin guardar en `src/components/records/builder-actions.ts` (test: `builder-actions.test.ts`)

## Phase 9: Polish

- [x] T029 [P] Prueba de segunda pestaña en solo lectura y toma de control en `tests/e2e/builder-acceptance.spec.ts`
- [x] T030 [P] Cobertura de líneas ≥ 85 % configurada en `vitest.config.mts`

## Dependencias

- T005–T008 bloquean todas las historias. US1 y US2 son independientes entre sí; US3 y US4 dependen de T007 y T017; US6 depende de T013.

## Evidencia

Comandos de verificación (la suite completa pasa con 917 tests según el encargo; no se re-ejecutó al redactar este documento):

```bash
bun run test                  # Vitest: unit, dom, integration (917 tests)
bun run test:coverage         # umbral de líneas 85 %
bun run test:e2e              # Playwright: builder.spec.ts, builder-acceptance.spec.ts
bun run lint && bun run typecheck
```

Commits relevantes (`git log --oneline`):

- `f794758` feat: fase 3 — modelo de dominio y validación
- `a9d8456` wip: backup del estado antes de cambiar de cuenta Claude (primera versión de estado, persistencia y `/editor`)
- `8262325` feat: cierre de la fase 6 — descarga de SVG, avisos de cuarentena y toma de control segura
- `5b9096e` docs: fase 6 cerrada, séptimo endpoint y Spec Kit
- `5b8d4c4` feat: fase 8 — editor visual (`/preview`) (añade `src/lib/state/history.ts`)
- `d4892ce` feat: interfaz en tres pasos (Piezas → Diseño → Exportar)
- `184f3f3` feat: pulido de pantallas con Impeccable live (detalle de pieza y barra de Diseño)
- `6da1e64` feat: link estable del QR por resort y servicio
- `57d20a1` fix: tests de «Descargar SVG» al menú de la tarjeta y lint sin carpetas de skills
