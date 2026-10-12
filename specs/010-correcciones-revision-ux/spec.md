# Feature Specification: Correcciones de la revisión de UX (rama `mejoras-ux`)

**Feature Branch**: `ux-correcciones` (creada desde `2ca58a9`, antes del commit ajeno `9d28551`)

**Created**: 2026-10-12

**Status**: In progress

**Input**: Revisión de los commits de UX `0268e2e` a `1df854d` de la rama `mejoras-ux`. La revisión no editó código. Verificación previa: `bun run typecheck` pasa; `bun run test:unit` pasa (64 archivos, 852 pruebas); `bun run lint` con 0 errores y 4 advertencias; las pruebas e2e de Playwright no se habían ejecutado.

**Alcance decidido**: el PR cubre solo los cambios de UX. El commit `9d28551` («feat: paso «Estilo del QR»», de `disenopr`, ~47 archivos, 2225 líneas) queda fuera de este PR y no se revisa aquí. No se reescribe ni se toca `mejoras-ux`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Umbral de la prueba de 1000 piezas con causa documentada (Priority: P1)

El equipo necesita que la prueba de exportación de 1000 piezas detecte regresiones reales del PDF. Hoy el umbral de tamaño mínimo se rebajó sin explicación.

**Why this priority**: un umbral rebajado sin causa puede esconder una regresión en la exportación, que es el resultado principal del producto.

**Independent Test**: `bun run test:e2e -- tests/e2e/export-1000.spec.ts --project=desktop` pasa con el umbral restaurado a `1_000_000`, o con el umbral justificado por una medición documentada.

**Acceptance Scenarios**:

1. **Given** el umbral original `1_000_000`, **When** se ejecuta la prueba sobre el código corregido, **Then** el PDF supera el umbral y la prueba pasa.
2. **Given** que el PDF no supera `1_000_000` por una causa legítima (texto vivo por defecto, desde `3055c2e`), **When** se documenta la medición, **Then** el umbral se justifica con esa evidencia y la prueba sigue detectando un PDF vacío o truncado.

---

### User Story 2 - Texto de error veraz según el almacenamiento (Priority: P1)

La pantalla de error no debe prometer que el proyecto «sigue guardado en este navegador» cuando el almacenamiento local no está disponible.

**Why this priority**: una afirmación falsa en un error de datos puede hacer que la persona cierre la pestaña y pierda trabajo.

**Independent Test**: prueba unitaria de `src/app/error.tsx` con `persistence.status` en `"unavailable"` y en otro estado; el texto cambia entre ambos casos.

**Acceptance Scenarios**:

1. **Given** `persistence.status !== "unavailable"`, **When** aparece el error, **Then** el texto dice que el proyecto sigue guardado en este navegador.
2. **Given** `persistence.status === "unavailable"`, **When** aparece el error, **Then** el texto dice que el proyecto no se guarda en este navegador y pide descargarlo antes de reintentar.

---

### User Story 3 - Documentación y copy sin referencias antiguas (Priority: P2)

`docs/ARCHITECTURE.md` y `docs/AUDITORIA-UX.md` deben usar los textos vigentes de la interfaz.

**Why this priority**: la documentación que no coincide con la interfaz lleva a decisiones equivocadas al mantener el producto.

**Independent Test**: `grep` de los textos antiguos en `docs/`, `src/` y `tests/` no devuelve coincidencias fuera de los registros históricos de esta spec.

**Acceptance Scenarios**:

1. **Given** `docs/ARCHITECTURE.md`, **When** se busca «Regenerar QR», «Mantener QR anterior», «Usar de todos modos» o «Reemplazar por QR generado», **Then** las referencias usan los textos vigentes: «Crear un QR nuevo con el link actual», «Imprimir el QR anterior (apunta al link viejo)», «Usar este QR aunque apunte a otra dirección» y «Cambiar por un QR nuevo de esta app».
2. **Given** el chip de cambios sin descargar, **When** se compara con la auditoría, **Then** ambos usan la misma frase canónica.

---

### User Story 4 - Formato de imports (Priority: P3)

Los imports nuevos de `RecordDetail.tsx` van con su bloque de imports de `@/lib` y `./`, sin línea en blanco intermedia.

**Why this priority**: es un nit de estilo, sin efecto en el comportamiento.

**Independent Test**: `bun run lint` no reporta problemas nuevos en ese archivo.

## Riesgos detectados

| ID | Archivo | Causa raíz | Impacto | Resultado esperado |
|----|---------|-----------|---------|--------------------|
| R1 | `tests/e2e/export-1000.spec.ts:35` | `cd47841` rebajó el umbral de `1_000_000` a `500_000` bytes sin justificar. Causa probable a confirmar con medición: el texto vivo es el valor por defecto desde `3055c2e` y produce un PDF más liviano. | La prueba deja de detectar PDFs pequeños o truncados. | Umbral restaurado, o justificado con medición registrada en `plan.md`. |
| R2 | `src/app/error.tsx:23` | El texto «Tu proyecto sigue guardado en este navegador» es fijo. No consulta `persistence.status`, que puede ser `"unavailable"` (ver `src/components/records/PersistenceBanners.tsx:67`). | La persona puede perder trabajo al creer que está guardado. | Texto condicional según `persistence.status`. |
| R3 | `docs/ARCHITECTURE.md:110, :128, :603, :612` | Los textos de los botones de QR cambiaron en `cd47841` (`src/components/records/RecordQrActions.tsx`) y la documentación no se actualizó. | Documentación que no coincide con la interfaz. | Referencias actualizadas a los textos vigentes. |
| R4 | `docs/AUDITORIA-UX.md:122`, `src/components/records/PersistenceBanners.tsx`, `src/components/records/BuilderToolbar.tsx:47` | La auditoría propone «Aún no has descargado el PDF»; el código usa «Cambios sin descargar». | Dos versiones del mismo aviso. | Una frase canónica en código y auditoría. Decisión en `plan.md`. |
| R5 | `src/components/records/RecordDetail.tsx:20-26` | Los imports nuevos de `@/lib/records/qr-badge` y `@/lib/state/StoreProvider` quedan separados de su bloque por una línea en blanco. | Ruido de estilo. | Imports agrupados. |
| R6 | Rama `mejoras-ux`, commit `9d28551` | Commit de `disenopr` (~47 archivos, 2225 líneas) dentro del PR de UX. | El PR mezcla dos alcances y no está revisado. | Decisión documentada: se excluye de este PR. Ver `plan.md`. |

## Requirements *(mandatory)*

- **FR-001**: el umbral de `export-1000.spec.ts` MUST quedar en `1_000_000` o justificado con una medición registrada.
- **FR-002**: `error.tsx` MUST mostrar un texto distinto cuando `persistence.status === "unavailable"`.
- **FR-003**: la documentación MUST usar los textos vigentes de la interfaz.
- **FR-004**: el commit `9d28551` MUST NOT formar parte del PR de UX.
- **FR-005**: ninguna corrección de código MUST aplicarse antes de que su riesgo esté registrado en este archivo.

## Success Criteria *(mandatory)*

- **SC-001**: `bun run typecheck` pasa.
- **SC-002**: `bun run test:unit` pasa con 804 pruebas (las de esta rama).
- **SC-003**: `bun run lint` no introduce advertencias nuevas respecto a `2ca58a9`.
- **SC-004**: `bun run test:e2e -- tests/e2e/export-1000.spec.ts --project=desktop` pasa.
- **SC-005**: `grep` de los textos antiguos no devuelve coincidencias en `src/`, `tests/` ni `docs/`, salvo en `specs/010-…`, en `CHANGELOG.md` y en las columnas «Texto actual» de `docs/AUDITORIA-UX.md`, que son registro histórico.

## Assumptions

- La medición de R1 se hace con la prueba e2e sobre el código actual (`2ca58a9`), antes de cualquier cambio.
- El texto canónico de R4 es el que ya está en código y en pruebas (decisión en `plan.md`).
- `error.tsx` está dentro de `AppProviders`, así que `useSession` está disponible (ver `src/app/layout.tsx:36`).
