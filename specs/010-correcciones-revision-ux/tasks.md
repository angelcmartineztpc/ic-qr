# Tareas: Correcciones de la revisión de UX

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Cada tarea cubre un riesgo (R1–R6) del spec. Marcar `[x]` solo cuando la verificación indicada pase.

## Fase 1 · Registro

- [x] **T-REG-1** Crear `spec.md`, `plan.md` y `tasks.md` en `specs/010-correcciones-revision-ux/`. Cubre: todos los riesgos.
- [x] **T-REG-2** Crear `CHANGELOG.md` en la raíz con la entrada del registro. Cubre: trazabilidad.
- [x] **T-REG-3** Separar `9d28551` creando `ux-correcciones` desde `2ca58a9`. Verificación: `git log --oneline -1` muestra `2ca58a9` y `git branch --contains 9d28551` no incluye `ux-correcciones`. Cubre: R6.

## Fase 2 · Medición (sin cambios de código)

- [x] **T-000** Instalar Chromium para Playwright (`bunx playwright install chromium`). Verificación: el log no tiene errores y la prueba arranca el navegador. Cubre: R1.
- [x] **T-001** Ejecutar `bun run test:e2e -- tests/e2e/export-1000.spec.ts --project=desktop` sobre `2ca58a9`. Registrar en `plan.md` (sección «Medición R1») el tamaño del PDF, el texto que produce el log y la comparación con `1_000_000`. Cubre: R1.

## Fase 3 · Correcciones

- [x] **T-010** Ajustar `tests/e2e/export-1000.spec.ts:35` según la medición: restaurar `1_000_000` si el PDF lo supera; si no, fijar un umbral con margen y justificarlo en un comentario que cite la medición. Verificación: la prueba pasa con el valor nuevo. Cubre: R1.
- [x] **T-020** Hacer condicional el texto de `src/app/error.tsx` según `useSession((s) => s.persistence.status)`. Verificación: prueba unitaria nueva que cubre ambos casos (`"unavailable"` y otro estado). Cubre: R2.
- [x] **T-030** Reemplazar en `docs/ARCHITECTURE.md` (líneas 110, 128, 603, 612) los textos antiguos por los vigentes de `RecordQrActions.tsx`. Verificación: `grep -n "Regenerar QR\|Mantener QR anterior\|Usar de todos modos\|Reemplazar por QR generado" docs/ARCHITECTURE.md` no devuelve nada. Cubre: R3.
- [x] **T-040** Alinear `docs/AUDITORIA-UX.md:122` y la sección U3 con la frase canónica «Cambios sin descargar». Verificación: la frase aparece igual en el código y en la auditoría. Cubre: R4.
- [x] **T-050** Agrupar los imports de `src/components/records/RecordDetail.tsx` sin línea en blanco intermedia. Verificación: `bun run lint` no reporta nada nuevo en ese archivo. Cubre: R5.

## Fase 4 · Verificación

- [x] **T-060** `bun run typecheck` pasa.
- [x] **T-061** `bun run test:unit` pasa: 60 archivos de unidad y 804 pruebas en esta rama (852 incluía las de `9d28551`, excluido).
- [x] **T-062** `bun run lint`: sin advertencias nuevas respecto a `2ca58a9` (4 advertencias en el estado previo).
- [x] **T-063** `bun run test:e2e` completo: 78 pasan, 12 omitidas (pruebas marcadas para un solo proyecto), 0 fallos. Registrar resultado. Si hay fallos previos no relacionados, documentarlos sin ocultarlos.
- [x] **T-064** `grep` de los textos antiguos en `src/`, `tests/` y `docs/` (fuera de `specs/010-…`) no devuelve coincidencias.

## Fase 5 · Cierre

- [ ] **T-070** Completar la entrada de `CHANGELOG.md` con los resultados reales de la verificación.
- [ ] **T-071** Commit en `ux-correcciones`. No se hace push ni PR sin confirmación del usuario (ver pendiente de D1 en `plan.md`).

## Fase 6 · Fusión en `main` (D7)

- [x] **T-080** Registrar D7 en `plan.md`, `tasks.md` y `CHANGELOG.md` antes de fusionar. Cubre: R6.
- [x] **T-081** Fusionar el PR #2 con `gh pr merge 2 --merge`. Verificación: `origin/main` contiene `3737989` y el registro D7. Cubre: R1–R5.
- [x] **T-082** Fusionar `ux-correcciones` en `mejoras-ux` y publicar. Verificación: `git merge-base --is-ancestor ux-correcciones mejoras-ux`. Cubre: R6.
- [x] **T-083** Actualizar la descripción del PR #1 al paso «Estilo del QR». Cubre: R6.

## Fase 7 · Hallazgos 3–5 y pruebas omitidas (D8)

- [x] **T-090** Registrar R7–R10, D8 y estas tareas antes de tocar código. Cubre: R7–R10.
- [x] **T-091** `EMPTY_TEMPLATE_OVERRIDES.qrStyle` como copia; prueba de que no comparte referencia. Cubre: R9.
- [x] **T-092** `QrLogoGeometrySchema` rechaza trazos; prueba que falla sin la corrección. Cubre: R7.
- [x] **T-093** `blockingQrStyleWarnings` en `@/lib/qr-style`; `qr-style-model.ts` y `prepareExport` la usan; prueba de integración: `/api/export` con contraste bajo responde 400. Cubre: R8.
- [x] **T-094** Documentar el motivo de las omisiones e2e (sección «Pruebas omitidas» de `plan.md`) y confirmar el conteo con el reporte. Cubre: R10.
- [x] **T-095** typecheck, test:unit, dom, lint e integración; e2e completo en `mejoras-ux`. Cubre: R7–R10.
