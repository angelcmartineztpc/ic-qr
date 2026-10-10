# Implementation Plan: Registros de piezas y validación

**Branch**: `001-registros-y-validacion` (retrospectiva; se desarrolló en `integracion-front-back`) | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-registros-y-validacion/spec.md`

## Summary

Modelo de dominio de las piezas (`QRRecord`), su validación estricta y tolerante, la detección de duplicados, el estado del proyecto en el navegador y la pantalla `/editor`. El enfoque real fue: esquemas Zod como única fuente de tipos; funciones puras de estado (`estado → estado`) que el store de zustand solo aplica; persistencia en IndexedDB con hidratación tolerante por registro; y acciones de interfaz en una fábrica sin React (`createBuilderActions`) para probar cada flujo sin navegador. Se implementó en la Fase 3 (`f794758`, dominio) y la Fase 6 (`a9d8456` y `8262325`, estado y `/editor`) de [`docs/ARCHITECTURE.md` §G](../../docs/ARCHITECTURE.md).

## Technical Context

**Language/Version**: TypeScript 5 en modo estricto (`tsconfig.json`), sin `any` ni `@ts-ignore` en el código de esta feature; Node `>=22.12` (`engines`), Bun 1.4.2 como gestor.

**Primary Dependencies**: Next.js 16.3.8 (App Router), React 19.2.8, Zod `^4.6.5`, zustand `^5.0.15`, `idb-keyval` `^6.3.0`, MUI `^9.4.0` con Tailwind v4, `@dnd-kit/core` `^6.3.1` y `@dnd-kit/sortable` `^10.0.0` (reordenar). `zundo` `^2.3.0` figura en `package.json` pero ningún archivo de `src` lo importa.

**Storage**: IndexedDB (base `qr-production-generator`, almacén `project`) con claves `project`, `backup-<fecha>` y `last-import`; archivo `.qrproj.json` bajo demanda. Sin base de datos de servidor.

**Testing**: Vitest `^5.0.3` con tres proyectos (`unit` en `src/**/*.test.ts`, `dom` en `src/**/*.test.tsx` con jsdom, `integration` en `tests/integration`), Testing Library y Playwright `^1.63.0` para E2E (`tests/e2e`). Umbral de cobertura de líneas 85 % en `src/lib`, `src/server` y `src/schemas`.

**Target Platform**: navegador moderno con contexto seguro (Web Locks y `crypto`); escritorio y móvil (en móvil el arrastre se desactiva y «Mover a…» lo sustituye).

**Project Type**: aplicación web full-stack (Next.js); esta feature es casi toda cliente y no añade endpoints.

**Performance Goals**: 1000 o más piezas sin bloquear la UI; rejilla paginada de 24, medida en 10–16 ms por cambio de página (nota de la Fase 6 de `docs/ARCHITECTURE.md`; no re-medida aquí).

**Constraints**: nada silencioso (todo descarte o transformación produce aviso); validación en la frontera; los mensajes al usuario en español; un único escritor entre pestañas.

**Scale/Scope**: hasta 5000 filas por importación (ver spec 003); proyectos de cientos de piezas; archivo de proyecto ≤ 20 MB.

## Constitution Check

Evaluado contra `.specify/memory/constitution.md` v1.0.0.

- **I. Una sola fuente de verdad y capas estrictas**: cumple. `src/lib/**` y `src/schemas/**` son puros; `grep` de `@/server` en `src/lib` y `src/components` no devuelve resultados y ESLint declara `no-restricted-imports` para esas capas (`eslint.config.mjs`).
- **II. Regla crítica del QR**: cumple. `createRecord` y `updateRecordData` nunca generan: con Link del QR el registro nace `existing`; `canApplyResolution` descarta resultados tardíos; cubierto en `factory.test.ts` y `project.test.ts`. La decisión de generar vive en `src/lib/records/qr-state.ts`.
- **III. El QR codifica un link estable**: no aplica. Esta feature solo incluye el selector `ResortLinkPicker` para rellenar el Link del menú; el redirect es la feature F004.
- **IV. Salida vectorial verificable**: no aplica; no toca `src/lib/svg`, `src/lib/document` ni `src/server/pdf` (solo ofrece «Descargar SVG de esta pieza» desde el servidor, solo para piezas exportables).
- **V. Validación en cada frontera y nada silencioso**: cumple. Estricta en formulario y re-validación; tolerante al hidratar (cuarentena por registro y copia de seguridad de la envoltura); mensajes en español.
- **VI. Seguridad por defecto**: cumple en lo que aplica. No añade Route Handlers; el archivo de proyecto se limita a 20 MB y se valida antes de usarse; las URLs rechazan esquemas peligrosos, credenciales e invisibles.
- **VII. Tests y calidad como contrato**: cumple. Tests unitarios, de DOM y E2E listados abajo; `no-alert` activo en ESLint; la suite completa pasa (917 tests).

## Project Structure

### Documentation (this feature)

```text
specs/001-registros-y-validacion/
├── spec.md
├── plan.md
├── data-model.md
└── tasks.md
```

No hay `contracts/` (sin endpoints) ni `research.md` (las decisiones están en `docs/ARCHITECTURE.md`).

### Source Code (repository root)

```text
src/
├── schemas/            record.ts, url.ts, project.ts, import.ts (clave de duplicados), schemas.test.ts
├── types/              record.ts, project.ts (tipos inferidos de Zod)
├── lib/
│   ├── text/           normalize.ts
│   ├── validation/     validate.ts, form.ts, url.ts, messages.es.ts, import-issues.ts
│   ├── records/        factory.ts, hydrate.ts, duplicates.ts, order.ts, natural-sort.ts, qr-state.ts, qr-badge.ts
│   └── state/          project.ts, stores.ts, StoreProvider.tsx, persistence.ts, idb.ts,
│                       project-file.ts, tab-lock.ts, counters.ts, history.ts
├── components/
│   ├── records/        EditorScreen, BuilderToolbar, RecordDetail, RecordCard, SortableStrip, MoveToDialog,
│   │                   RecordCounters, PersistenceBanners, QrStatusBadge, builder-actions.ts, useBuilderActions.ts
│   └── forms/          RecordForm.tsx, ResortLinkPicker.tsx
└── app/editor/         page.tsx

tests/
├── integration/        (sin tests propios de esta feature)
└── e2e/                builder.spec.ts, builder-acceptance.spec.ts
```

Tests unitarios junto al código: `src/lib/validation/{validate,form}.test.ts`, `src/lib/records/{factory,hydrate,duplicates,order}.test.ts`, `src/lib/state/{project,persistence,project-file,tab-lock,counters,history}.test.ts`, `src/lib/text/normalize.test.ts`, `src/schemas/schemas.test.ts`. Tests de DOM: `src/components/records/EditorScreen.test.tsx`. Tests de acciones: `src/components/records/builder-actions.test.ts`.

**Structure Decision**: aplicación Next.js única con capas `schemas → lib (puro) → components`, tal como fija la constitución (principio I). La lógica de dominio no depende de React; los componentes solo orquestan.

## Decisiones técnicas relevantes

- **Estado como funciones puras** (`src/lib/state/project.ts`): cada mutación sube `revision` una sola vez; `dirty = revision !== savedRevision`.
- **Hidratación tolerante**: `PersistedProjectSchema` valida la envoltura y `StoredRecordSchema` cada registro; `withDerived` re-deriva estado y errores.
- **Autoguardado**: `createAutosaver` con debounce de 200 ms (en `docs/ARCHITECTURE.md` §S6 figura 500 ms; prevalece la nota de la Fase 6, que coincide con el código).
- **Deshacer**: el borrado usa un búfer propio (`session.lastDeleted`, un solo borrado); `EditorHistory` (100 pasos) pertenece al editor visual. `zundo` no se usa.
- **Reordenar**: `order` es la fuente de verdad; `record.order` solo se materializa al exportar o guardar el archivo (`materializeOrder`).
