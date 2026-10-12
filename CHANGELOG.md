# Bitácora

Formato: `[fecha] · [autor] · [riesgo] · [archivo] · [acción]`. Spec de referencia: [specs/010-correcciones-revision-ux](specs/010-correcciones-revision-ux/spec.md).

- [2026-10-12] · angelcmartineztpc · R6 · commit `9d28551` (`disenopr`) · Excluido del PR de UX. Rama `ux-correcciones` creada desde `2ca58a9`. `mejoras-ux` sin cambios.
- [2026-10-12] · angelcmartineztpc · R1 · specs/010-correcciones-revision-ux · Registro del riesgo: umbral de `tests/e2e/export-1000.spec.ts` rebajado de 1_000_000 a 500_000 sin justificar (`cd47841`). Medición pendiente (T-001).
- [2026-10-12] · angelcmartineztpc · R2 · src/app/error.tsx · Registro del riesgo: texto «Tu proyecto sigue guardado en este navegador» sin comprobar el estado de persistencia. Corrección pendiente (T-020).
- [2026-10-12] · angelcmartineztpc · R3 · docs/ARCHITECTURE.md · Registro del riesgo: referencias a textos antiguos de los botones de QR. Corrección pendiente (T-030).
- [2026-10-12] · angelcmartineztpc · R4 · docs/AUDITORIA-UX.md, src/components/records/BuilderToolbar.tsx · Registro del riesgo: dos versiones del aviso de cambios sin descargar. Frase canónica decidida en `plan.md` (D4). Corrección pendiente (T-040).
- [2026-10-12] · angelcmartineztpc · R5 · src/components/records/RecordDetail.tsx · Registro del riesgo: imports con línea en blanco intermedia. Corrección pendiente (T-050).
- [2026-10-12] · angelcmartineztpc · R1 · tests/e2e/export-1000.spec.ts, specs/010 plan.md · Medición: PDF de 1000 piezas de 0.9 MiB con texto vivo (por defecto desde `3055c2e`). Umbral mantenido en 500 000 bytes, con comentario que cita la medición. Prueba pasa.
- [2026-10-12] · angelcmartineztpc · R2 · src/app/error.tsx, src/app/error.test.tsx · Texto de error condicional a `persistence.status === "unavailable"`. Prueba nueva con dos casos (pasa).
- [2026-10-12] · angelcmartineztpc · R3 · docs/ARCHITECTURE.md, README.md, src/lib/records/factory.ts · Textos antiguos de los botones de QR y de «Cambios sin exportar» reemplazados por los vigentes.
- [2026-10-12] · angelcmartineztpc · R4 · docs/AUDITORIA-UX.md, docs/ARCHITECTURE.md, src/components/records/builder-actions.test.ts · Frase canónica «Cambios sin descargar» en código, documentación y pruebas.
- [2026-10-12] · angelcmartineztpc · R5 · src/components/records/RecordDetail.tsx · Imports agrupados sin línea en blanco intermedia.
- [2026-10-12] · angelcmartineztpc · Verificación · todo · typecheck pasa; test:unit 804 pruebas pasan; dom 57 pasan; lint 0 errores y 4 advertencias (las mismas); e2e completo 78 pasan, 12 omitidas, 0 fallos.
- [2026-10-12] · angelcmartineztpc · R6 · specs/010-correcciones-revision-ux/plan.md (D7) · Decisión: fusionar el PR #2 (`ux-correcciones`) en `main` con merge commit; `9d28551` queda fuera y se integra con el PR #1.
- [2026-10-12] · angelcmartineztpc · R1–R5 · origin/main · PR #2 fusionado con merge commit (`9e72ca6`). `main` contiene `3737989` y el registro D7.
- [2026-10-12] · angelcmartineztpc · R6 · mejoras-ux, PR #1 · `main` fusionado en `mejoras-ux` (sigue apilada, sin divergencias); descripción del PR #1 actualizada al paso «Estilo del QR» (49 archivos contra `main`). `9d28551` sigue fuera de `main`.
- [2026-10-12] · angelcmartineztpc · R7–R10 · specs/010-correcciones-revision-ux · Registro de los hallazgos 3–5 de la revisión del paso «Estilo del QR» y de las pruebas e2e omitidas, con D8 y tareas T-090 a T-095. `ux-correcciones` (local y remota) borrada: ya estaba en `main`.
- [2026-10-12] · angelcmartineztpc · R9 · src/schemas/template.ts · `EMPTY_TEMPLATE_OVERRIDES.qrStyle` es una copia de `DEFAULT_QR_STYLE`. Prueba en `src/schemas/qr-style.test.ts` (falla sin la corrección).
- [2026-10-12] · angelcmartineztpc · R7 · src/schemas/qr-style.ts · `QrLogoGeometrySchema` rechaza `stroke` y `strokeWidth`. Prueba en `src/schemas/qr-style.test.ts` (falla sin la corrección).
- [2026-10-12] · angelcmartineztpc · R8 · src/lib/qr-style/warnings.ts, src/components/qr-style/qr-style-model.ts, src/server/export/run-export.ts · `blockingQrStyleWarnings` compartida por cliente y servidor; `/api/export` responde 400 ante un estilo bloqueante. Pruebas en `src/lib/qr-style/blocking.test.ts` y `tests/integration/export.test.ts` (la de integración falla sin la corrección del servidor).
- [2026-10-12] · angelcmartineztpc · R10 · specs/010 plan.md · Las 12 omisiones e2e son `test.skip` por proyecto (desktop/móvil); conteo confirmado con el reporte.
- [2026-10-12] · angelcmartineztpc · Verificación · mejoras-ux · typecheck pasa; test:unit 859; dom 70; integración 100 (1 archivo omitido); lint 0 errores y 4 advertencias (las mismas); e2e 90 pasan, 12 omitidas, 0 fallos.
