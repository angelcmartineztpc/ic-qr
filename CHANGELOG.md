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
