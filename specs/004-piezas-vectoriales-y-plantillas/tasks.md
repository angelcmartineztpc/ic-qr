# Tasks: Piezas vectoriales y plantillas

**Input**: `/specs/004-piezas-vectoriales-y-plantillas/` (spec.md, plan.md, data-model.md). Tareas retrospectivas: `[x]` solo con archivo existente más test o commit; `[ ]` es una verificación manual pendiente.

**Formato**: `[ID] [P?] [Historia] Descripción con ruta`

## Fase 1: Base compartida

- [x] T001 Unidades en mm, pt y SVG, `pageSizePt` y `round` en `src/lib/units/index.ts` (test: `src/lib/units/index.test.ts`; commit `005ba21`)
- [x] T002 [P] Normalización de texto (NFC, controles, espacios) en `src/lib/text/normalize.ts` (test: `src/lib/text/normalize.test.ts`)
- [x] T003 [P] Esquemas `TemplateSchema`, `TemplateOverridesSchema` y `PDFOptionsSchema` en `src/schemas/template.ts` y `src/schemas/pdf.ts` (test: `src/schemas/schemas.test.ts`; commit `f794758`)
- [x] T004 [P] Puerto de fuentes `FontResolver` en `src/lib/document/fonts.ts` y registro fontkit en `src/server/fonts/node-font-registry.ts` (test: `src/server/fonts/piece-font.integration.test.ts`)

## Fase 2: Historia 3 — QR como path único (P1)

- [x] T005 [US3] Codificar la matriz con corrección H sin zona de silencio en `src/lib/qr/encode.ts` (test: `src/lib/qr/qr.test.ts`, versión 4 = 33 módulos; commit `005ba21`)
- [x] T006 [US3] Contorno único de la matriz en `src/lib/qr/matrix-to-path.ts` (test: fuzz de 300 casos con `nonzero` y `evenodd` en `src/lib/qr/qr.test.ts`)
- [x] T007 [US3] Política de módulo mínimo en `src/lib/layout/warnings.ts` (test: `src/lib/layout/geometry.test.ts`, «política de módulo»)

## Fase 3: Historia 2 — Una escena, tres salidas (P1)

- [x] T008 [US2] `buildScene` y `TileScene` en `src/lib/document/scene.ts` y `src/types/scene.ts` (test: `src/lib/document/scene.test.ts`)
- [x] T009 [P] [US2] Motor de texto (medida, tracking, `shrink`, `wrap`, caracteres) en `src/lib/document/text/engine.ts` (test: `src/lib/document/text/engine.test.ts`)
- [x] T010 [P] [US2] `renderSceneSvg` con capas, mm y escape en `src/lib/svg/render-scene.ts` y `src/lib/svg/escape.ts` (test: `src/lib/svg/render-scene.test.ts`)
- [x] T011 [US2] `PdfSheetWriter` (pdfkit; página desde mm; CMYK, tinta plana, sangrado con TrimBox/BleedBox) en `src/server/pdf/writer.ts` (test: `src/server/pdf/pdf.integration.test.ts`)

## Fase 4: Historia 1 — La pieza reproduce la referencia (P1)

- [x] T012 [US1] Plantilla `tropical-table` v2.0.0 (70 × 70 mm, marco 0.5 pt, textos literales, QR 24.788 mm) en `src/templates/tropical-table/template.ts` (test: `src/server/fonts/piece-font.integration.test.ts`; commit `76093b2`)
- [x] T013 [P] [US1] Fuente de las piezas y constante `PIECE_INK` en `src/templates/address-sans.ts`; tinta `#000000` (test: «la tinta es negro puro»; commit `7f2f541`)
- [x] T014 [P] [US6] Plantillas `restaurant-default` y `custom-template` con su README en `src/templates/restaurant-default/template.ts`, `src/templates/custom-template/` y registro en `src/templates/index.ts` (test: `piece-font.integration.test.ts`, «restaurant-default también construye»)
- [x] T015 [US1] Juego de caracteres admitido en `src/lib/document/charset.ts` (test: «cubre todo el juego de caracteres admitido» en `piece-font.integration.test.ts`)
- [x] T016 [US1] Instalación y validación de fuentes (`.woff2`, sha256 y huella de la Cd) en `scripts/setup-fonts.mts`, `scripts/fonts-lib.mts` y `assets/fonts/address-sans/manifest.json` (test: `tests/integration/fonts-lib.test.ts`; commits `930885b`, `ae8e4b5`, `8a4b100`, `8810065`, `2670cc6`)

## Fase 5: Historia 4 — Texto en contornos o vivo (P2)

- [x] T017 [US4] `outlineScene` (texto a contornos con `<title>`) en `src/lib/document/outline.ts` (test: `src/lib/document/scene.test.ts`, «outlineScene»; `piece-font.integration.test.ts`)
- [x] T018 [US4] Texto vivo con fuente incrustada en PDF y `<text>` en SVG (test: `pdf.integration.test.ts`, «modo texto vivo»; `render-scene.test.ts`, «texto vivo»)

## Fase 6: Historia 5 — Empaquetado en hojas (P2)

- [x] T019 [US5] `packGrid`, `paginate`, `describeSheet` y `SheetLayoutError` en `src/lib/document/sheet.ts` (test: `src/lib/document/sheet.test.ts`; `pdf.integration.test.ts` verifica 6 por hoja y origen (32.5, 38.5) mm)

## Fase 7: Historia 6 — Calibración y muestras (P3)

- [x] T020 [US6] Hoja de calibración de 16 piezas en `src/lib/document/calibration.ts` y muestras en `scripts/render-sample.mts` (`bun run render:sample`)
- [ ] T021 [US6] Grabar `out/calibration.pdf` en el material real y ajustar `qr.warnModuleMm`, `qr.minModuleMm` y el texto mínimo (manual, en taller)
- [ ] T022 Abrir `out/sample-sheet.pdf`, `sample-single.pdf`, `sample-live.pdf` y `sample.svg` en Illustrator y ejecutar `scripts/illustrator-check.jsx` (manual; ver pendientes)
- [ ] T023 Actualizar `scripts/illustrator-check.jsx` (hoy solo reconoce mesas de 50 × 50, 210 × 297 y 215.9 × 279.4 mm) y `docs/ILLUSTRATOR.md` a la pieza de 70 × 70 mm (6 por A4)
- [ ] T024 Escanear con un móvil el QR impreso o grabado de una pieza real (manual)

## Evidencia

Comandos (solo lectura; el caller informó 917 tests en verde): `bun run test`, `bun run lint`, `bun run typecheck`, `bun run render:sample`, `bun run fonts:setup`.

Commits (`git log --oneline`):

- `f794758` feat: fase 3 — modelo de dominio y validación
- `005ba21` feat: fase 4 — núcleo vectorial: QR, texto, escena, SVG y PDF
- `76093b2` feat: pieza idéntica a la referencia (Address Sans Pro Cd, 70 × 70 mm, marco, #2C2E35)
- `930885b` chore: fuentes en .woff2 (Gotham y Address Sans Pro)
- `8810065` fix: no fijar el sha256 de Address Sans con un archivo que no es la versión Cd
- `8a4b100` docs: huella de la Address Sans Pro Cd real tomada del .ai original
- `ae8e4b5` feat: fonts:setup busca en la caché de Adobe, convierte a .woff2 y valida la huella de la Cd
- `2670cc6` fix: fonts:setup acepta fuentes ya instaladas con --write-manifest y fija el sha256 de la Cd
- `7f2f541` feat: tinta de las piezas en negro puro #000000 (RGB)
