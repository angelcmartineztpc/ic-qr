# Implementation Plan: Piezas vectoriales y plantillas

**Branch**: `004-piezas-vectoriales-y-plantillas` (retrospectiva; se desarrolló en `integracion-front-back`) | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-piezas-vectoriales-y-plantillas/spec.md`

## Summary

Cada pieza se describe una sola vez como `TileScene` (nodos en mm) a partir de una plantilla de datos Zod, un layout, el registro y la geometría del QR. De esa escena salen tres resultados: SVG por pieza (`renderSceneSvg`), PDF vectorial (`PdfSheetWriter`, pdfkit) y la variante con texto en contornos (`outlineScene`). La plantilla de producción `tropical-table` v2.0.0 reproduce la referencia `QR_Tropical_1M_Alimentos.pdf` (70 × 70 mm) con Address Sans Pro Cd Semibold y tinta `#000000` en RGB. El QR es un único path compuesto. `packGrid` coloca las piezas en hojas (A4: 6 por página).

Decisiones y evidencia de fondo: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §E.1 (pdfkit directo, sin motor externo), §E.2 (unidades), §E.3–E.6, §E.7 (números trabajados) y las notas de la Fase 4 y del cambio de tinta. Donde difieren, las notas posteriores prevalecen (ver «Diferencias entre docs y código» abajo).

## Technical Context

**Language/Version**: TypeScript 5 estricto; Node `>=22.12` (`engines`), build y runtime en Node 24 según la constitución.

**Primary Dependencies** (verificadas en `package.json`): `next` 16.3.8, `react` 19.2.8, `zod` ^4.6.5, `qr` 0.7.2, `pdfkit` 0.20.2, `fontkit` 2.0.4, `fflate` ^0.8.3. Dev: `wawoff2` ^2.0.1 (conversión a `.woff2` en `fonts:setup`), `jsqr` ^1.4.0 y `pdfjs-dist` ^6.4.299 (verificación en tests), `pdf-lib` ^1.17.1. Sin dependencias nuevas en esta feature.

**Storage**: Fuentes en disco (`assets/fonts/<familia>/*.woff2`, no versionadas, con `manifest.json` versionado). El QR almacenado pertenece a otra feature (Constitución II).

**Testing**: Vitest 5 (`bun run test`: proyectos `unit`, `dom`, `integration`). Los tests que necesitan la fuente se saltan si falta (`HAS_PIECE_FONT` en `tests/helpers/piece-font.ts`).

**Target Platform**: Servidor Node (PDF y contornos); el SVG es isomórfico (`src/lib/**`).

**Project Type**: Aplicación web Next.js (App Router).

**Performance Goals**: 1000 piezas en el PDF en menos de 10 s (test); cifras medidas de 5000 piezas están en §E.1 y no se han reverificado aquí.

**Constraints**: geometría en mm; 0 imágenes, páginas calculadas desde mm; QR en un único path; ids de SVG únicos; sin CSS, `<use>` ni `<image>`.

**Scale/Scope**: 3 plantillas, 1 fuente de piezas (un peso), 1 hoja de calibración de 16 piezas, hasta 5000 piezas por exportación (ver 005).

## Constitution Check

Contra `.specify/memory/constitution.md` v1.0.0:

- **I. Una sola fuente de verdad y capas estrictas**: cumple. `buildScene` es la única geometría; `src/lib/document`, `svg`, `qr`, `units` no importan `fs` ni `server-only`; `src/server/pdf` y `src/server/fonts` sí lo llevan.
- **II. Regla crítica del QR**: no aplica. Esta feature recibe un `QrGeometry` ya resuelto (matriz o instantánea externa); no decide si se genera.
- **III. El QR codifica un link estable**: no aplica. El contenido del QR no se decide aquí.
- **IV. Salida vectorial verificable**: cumple. 0 imágenes, páginas en mm, QR de un solo path, texto en contornos o vivo, SVG sin imágenes ni estilos. La parte de «verificación en Illustrator» está pendiente (manual).
- **V. Validación en cada frontera**: cumple. `TemplateSchema.parse` al cargar `src/templates/index.ts`; avisos visibles (`TEXT_OVERFLOW`, `MISSING_GLYPH`, `QR_MODULE_SMALL`); `SheetLayoutError` con mensaje en español.
- **VI. Seguridad por defecto**: cumple en lo que toca: el texto de usuario se escapa en el SVG (`src/lib/svg/escape.ts`, test de texto hostil); las fuentes comerciales no se versionan. Los endpoints viven en la feature 005.
- **VII. Tests y calidad como contrato**: cumple con una salvedad: varias pruebas del motor usan una plantilla de 50 mm de prueba (`tests/helpers/legacy-tile.ts`) y no la pieza real; la pieza real se vigila en `piece-font.integration.test.ts`.

Restricciones adicionales: Fuentes (Gotham para interfaz, Address Sans Pro Cd para piezas, `.woff2`, sha256 y huella de la Cd) cumple. Código heredado: no se reintroduce.

## Project Structure

### Documentation (this feature)

```text
specs/004-piezas-vectoriales-y-plantillas/
├── spec.md
├── plan.md
├── data-model.md
└── tasks.md
```

### Source Code (estado real)

```text
src/
├── lib/
│   ├── units/index.ts            # mm, pt, SVG (décimas de mm), pageSizePt, round
│   ├── text/normalize.ts         # NFC, controles, espacios
│   ├── qr/                       # encode, matrix-to-path (contorno único), render-svg, hash
│   ├── layout/                   # geometry, presets, resolve-layout, warnings (política de módulo)
│   ├── document/
│   │   ├── scene.ts              # buildScene → TileScene
│   │   ├── outline.ts            # texto → contornos
│   │   ├── sheet.ts              # packGrid, paginate, describeSheet
│   │   ├── calibration.ts        # hoja de calibración (16 piezas)
│   │   ├── charset.ts            # SUPPORTED_CHARSET
│   │   ├── fonts.ts              # puerto de fuentes (FontResolver)
│   │   └── text/engine.ts        # fit, medida, tracking, caracteres
│   └── svg/render-scene.ts       # renderSceneSvg
├── templates/
│   ├── address-sans.ts           # fuente de las piezas y PIECE_INK
│   ├── tropical-table/template.ts
│   ├── restaurant-default/template.ts
│   ├── custom-template/{template.ts,README.md}
│   └── index.ts                  # registro validado
├── server/
│   ├── pdf/writer.ts             # PdfSheetWriter (pdfkit)
│   └── fonts/                    # NodeFontRegistry (fontkit, solo servidor)
├── schemas/{template.ts,pdf.ts}
scripts/{render-sample.mts,setup-fonts.mts,fonts-lib.mts,illustrator-check.jsx}
assets/fonts/{address-sans,gotham}/manifest.json   # los .woff2 no se versionan
docs/ILLUSTRATOR.md
tests/helpers/{piece-font.ts,legacy-tile.ts,pdf-inspect.ts}
```

Pruebas: `src/lib/{units,qr,svg,layout,text}/*.test.ts`, `src/lib/document/{scene,sheet}.test.ts`, `src/lib/document/text/engine.test.ts`, `src/server/pdf/pdf.integration.test.ts`, `src/server/fonts/piece-font.integration.test.ts`, `tests/integration/fonts-lib.test.ts`, `src/schemas/schemas.test.ts`.

**Structure Decision**: núcleo isomórfico en `src/lib`, escritura de PDF y lectura de fuentes en `src/server`, plantillas como datos en `src/templates`; sigue la capa descrita en `docs/ARCHITECTURE.md` §A.2.

## Diferencias entre docs y código (a tener en cuenta)

- `docs/ARCHITECTURE.md` §E.3, §E.7 y §E.11 conservan el ejemplo de 50 × 50 mm con Montserrat/Gotham y 15 piezas por A4. El código vigente es 70 × 70 mm, Address Sans Pro Cd y 6 piezas por A4; las notas de la Fase 4 y el commit `76093b2` lo reemplazan.
- §E.3 dibuja el QR como `qr-modules` con `fill-rule="nonzero"`; el código emite `id="qr-code"` con `evenodd`, y `tropical-table` no tiene capa `background` (no declara fondo de pieza).
- §E.4 dice que `invert` graba los claros; no se ha reverificado aquí.
- §E.5 describe `SUPPORTED_CHARSET` como Latin-1 más puntuación; el código incluye también Latin Extended-A y excluye 8 caracteres.
- `docs/ILLUSTRATOR.md`, `package.json` (campo `description`), el encabezado de `scripts/render-sample.mts` y `scripts/illustrator-check.jsx` aún hablan de piezas de 50 × 50 mm y 15 por hoja. El script de Illustrator solo acepta mesas de trabajo de 50 × 50, 210 × 297 o 215.9 × 279.4 mm, así que una página de 70 × 70 mm (`sample-single.pdf`) fallaría esa comprobación aunque el archivo sea correcto.
