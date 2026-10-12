# Implementation Plan: Importación de Excel (.xlsx) y CSV

**Branch**: `003-importacion-excel-csv` (retrospectiva; se desarrolló en `integracion-front-back`) | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-importacion-excel-csv/spec.md`

## Summary

Importación de piezas desde `.xlsx` y `.csv` con una sola tubería: el servidor valida y lee el archivo en memoria (guard del contenedor ZIP, SheetJS aislado en un worker, o decodificación de CSV), convierte las celdas en filas crudas y las pasa por código puro (`src/lib/excel`) que detecta cabeceras, coerciona celdas, valida cada fila con las reglas de la spec 001 y devuelve un `ImportResult`. El cliente recalcula los duplicados con la clave del proyecto, deja elegir estrategia y modo, y crea todas las piezas en una sola mutación. Se implementó en la Fase 7 (`90b0dbc`) y su adenda (`d9a22b1`: CSV y Link del menú común) de [`docs/ARCHITECTURE.md` §G](../../docs/ARCHITECTURE.md).

## Technical Context

**Language/Version**: TypeScript 5 estricto; Node `>=22.12` (`engines`); el worker es JavaScript plano (`parse-worker.mjs`) porque `new Worker()` necesita un archivo en disco.

**Primary Dependencies**: SheetJS `xlsx` 0.20.3 instalado desde `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; `fflate` `^0.8.3` (inflado acotado y reconstrucción del ZIP); Zod `^4.6.5`; Next.js 16.3.8; React 19.2.8; MUI `^9.4.0`; zustand `^5.0.15`.

**Storage**: ninguno en servidor (el archivo nunca se guarda); en el navegador, IndexedDB clave `last-import`.

**Testing**: Vitest `^5.0.3` (proyectos `unit`, `dom`, `integration`) y Playwright `^1.63.0`; `tests/e2e/import.spec.ts` contra el servidor de producción, en escritorio y móvil.

**Target Platform**: servidor Node con una réplica (semáforo y límites en memoria); navegador moderno.

**Project Type**: aplicación web full-stack (Next.js); un Route Handler y un conjunto de pantallas.

**Performance Goals**: 5000 filas parseadas en unos 60 ms sin contar el arranque del worker (§S1.11 de `docs/ARCHITECTURE.md`; no re-medido aquí).

**Constraints**: cuerpo ≤ 10 MB, ≤ 5000 filas, ≤ 300 000 celdas, ≤ 2000 entradas ZIP, inflado ≤ 20 MiB por entrada y 40 MiB en total, worker con 512 MB de heap y 10 s, 2 importaciones concurrentes y 10 por minuto.

**Scale/Scope**: archivos de hasta 5000 filas de datos y 50 columnas.

## Constitution Check

Evaluado contra `.specify/memory/constitution.md` v1.0.0.

- **I. Capas estrictas**: cumple. `src/lib/excel/**` es código puro sin SheetJS; `src/server/excel/{upload-guard,read-workbook,import-excel}.ts` llevan `import "server-only"`; la ruta importa del servidor y `src/components/import` solo habla con `src/lib/app/import-client.ts` por HTTP.
- **II. Regla crítica del QR**: cumple. `importRecords` crea la pieza con `qr = existing` si hay Link del QR y nunca genera; una URL no segura crea la pieza con `qrError` (`project.test.ts`: «regla crítica…»).
- **III. QR con link estable**: no aplica a la importación. El selector de resort y servicio (`ResortLinkPicker`, feature F004) solo rellena el Link del menú común.
- **IV. Salida vectorial verificable**: no aplica; no toca el pipeline de SVG ni PDF.
- **V. Validación en cada frontera y nada silencioso**: cumple. Validación estricta por fila con los mismos mensajes que el formulario; ninguna fila desaparece (invariante probado); descartes y transformaciones generan `ImportIssue`.
- **VI. Seguridad por defecto**: cumple. `withApiGuards`, guard ZIP estricto con reconstrucción, worker con límites y cuerpo binario con tope. SheetJS viene de su CDN con versión fija y `bun run check:sheetjs` vigila versiones nuevas; no hay descargas externas durante la importación.
- **VII. Tests y calidad como contrato**: cumple. Tests unitarios, de integración, de DOM y E2E (ver abajo). El test con libros reales (`real-workbooks.test.ts`) se omite sin archivos y no se ha debilitado.

Dependencias justificadas (constitución, «Restricciones adicionales»): `xlsx` desde el CDN de SheetJS porque, según el comentario de `scripts/check-sheetjs.mts`, la versión de npm tiene CVE sin corregir; `fflate` para inflar con tope exacto y reconstruir el ZIP que recibe SheetJS.

## Project Structure

### Documentation (this feature)

```text
specs/003-importacion-excel-csv/
├── spec.md
├── plan.md
├── data-model.md
├── contracts/
│   └── import-excel.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── schemas/            import.ts (ImportResult, ImportIssue, mapeo, clave de duplicados)
├── types/              import.ts
├── app/
│   ├── api/import/excel/route.ts
│   └── import/page.tsx
├── server/excel/       upload-guard.ts, read-workbook.ts, import-excel.ts, parse-worker.mjs
├── lib/
│   ├── excel/          headers.ts, coerce.ts, csv.ts, import-pipeline.ts, review.ts,
│   │                   error-report.ts, file-issues.ts, types.ts
│   ├── validation/     import-issues.ts (ImportIssue desde un fallo de campo)
│   ├── records/        duplicates.ts (compartido con la spec 001)
│   ├── app/            import-client.ts
│   └── state/          last-import.ts, project.ts (importRecords)
└── components/import/  ImportScreen, ExcelUploader, ImportSummary, IssueList, DuplicateList,
                        DuplicateKeyDialog, ColumnMappingDialog, import-actions.ts, useImportActions.ts

scripts/check-sheetjs.mts
next.config.ts          (outputFileTracingIncludes: worker y node_modules/xlsx para /api/import/excel)

tests/
├── integration/        api-import.test.ts, real-workbooks.test.ts
├── fixtures/real/      README.md (libros reales, no se versionan)
└── e2e/                import.spec.ts
```

Tests unitarios junto al código: `src/lib/excel/{headers,coerce,csv,import-pipeline,review,error-report}.test.ts`, `src/server/excel/upload-guard.test.ts`, `src/lib/records/duplicates.test.ts`, `src/lib/state/project.test.ts` (`importRecords`). Tests de DOM y acciones: `src/components/import/ImportScreen.test.tsx` y `import-actions.test.ts`.

**Structure Decision**: separar lo que necesita SheetJS y el sistema de archivos (`src/server/excel`) de todo lo demás (`src/lib/excel`), que se prueba con matrices de celdas sin SheetJS (constitución, principio I).

## Decisiones técnicas relevantes

- **Cuerpo binario, no multipart**: evita `formData()` sin límite; el tipo `text/plain` sigue prohibido por CSRF y el cliente envía los CSV como `application/octet-stream`.
- **Descriptores de datos admitidos** si coinciden con el directorio central (decisión de la Fase 7); ZIP64, cifrado, bytes sobrantes y EOCD no final siguen rechazados. Cubierto con fixtures armados a mano, no con archivos reales de Google Sheets.
- **Duplicados**: el servidor clasifica con la clave por defecto solo como punto de partida; el cliente recalcula con la clave del proyecto y contra las piezas existentes (`reviewImport`).
- **Una sola mutación** (`importRecords`): un paso de autoguardado y una sola subida de `revision`.
- **Resultado persistente**: `last-import` guarda `{result, outcome}`; el `File` no se persiste.
