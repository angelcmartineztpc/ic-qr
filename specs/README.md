# Specs

Documentación del proyecto en formato [Spec Kit](../.specify/): una carpeta por funcionalidad con `spec.md` (qué y por qué), `plan.md` (cómo, con el Constitution Check contra [la constitución](../.specify/memory/constitution.md)) y `tasks.md` (qué se hizo, con evidencia). Algunas llevan `data-model.md` y `contracts/` con los endpoints.

Las ocho carpetas `001`–`008` son **retrospectivas**: se escribieron el 2026-10-09 a partir del código ya implementado y de [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md), no antes de construirlo. Las tareas con `[x]` citan un archivo existente y un test o commit; las `[ ]` son trabajo pendiente real o verificaciones manuales. Lo que no se pudo comprobar está en la sección «Pendientes» de cada `spec.md` y resumido en [`PENDIENTES.md`](PENDIENTES.md).

| # | Funcionalidad | Fases de ARCHITECTURE | Estado |
|---|---|---|---|
| [001](001-registros-y-validacion/spec.md) | Registros, validación, estado y editor de piezas (`/editor`) | 3, 6 | Implemented |
| [002](002-qr-resolucion-y-storage/spec.md) | Regla crítica del QR, resolución/verificación y storage | 5 | Implemented |
| [003](003-importacion-excel-csv/spec.md) | Importación de Excel y CSV | 7 | Implemented |
| [004](004-piezas-vectoriales-y-plantillas/spec.md) | Pieza de 70 × 70 mm, plantillas, SVG/PDF vectorial, fuente y tinta | 4 | Implemented |
| [005](005-exportacion-y-descarga/spec.md) | Exportación (PDF/ZIP de SVG), texto vivo, descarga y visor | 9, 10 | Implemented |
| [006](006-editor-visual-y-flujo-en-tres-pasos/spec.md) | Editor visual de la plantilla y flujo Piezas → Diseño → Exportar | 8 | Implemented |
| [007](007-link-estable-del-qr/spec.md) | Link estable del QR por resort y servicio | — (venía de `qr-api-created`) | Implemented |
| [008](008-plataforma-seguridad-y-despliegue/spec.md) | Entorno, guardas HTTP, autenticación, Docker, fuentes, tests | 2, 11 | Implemented |

## Especificaciones anteriores (F001–F004)

Se escribieron en la rama `qr-api-created`, cuando el código vivía en `app/`, `lib/` y `data/`. Tras la integración con `integracion-front-back` ese código se reemplazó por `src/`. Se conservan como registro de las decisiones; este mapa indica dónde está hoy cada cosa y qué carpeta nueva las cubre.

| Spec | Tema | Dónde vive hoy | Cubierta por |
|---|---|---|---|
| F001 | Propiedades (resorts, servicios, destinos) | `src/lib/resorts/properties.ts` (+ test) | 007 |
| F002 | Generación de QR | `src/lib/qr`, `src/server/qr` y `POST /api/qr/resolve` | 002 |
| F003 | Etiqueta y exportación | `src/lib/document`, `src/server/export`, `src/server/pdf` y `POST /api/export` (pieza de 70 × 70 mm, no 50 × 50) | 004, 005 |
| F004 | URL estable del QR + redirect | `src/app/api/qr/[resortCode]/[service]/route.ts`; selector en `src/components/forms/ResortLinkPicker.tsx` | 007 |

Diferencias respecto al texto de las F00x:

- La variable del dominio es `NEXT_PUBLIC_QR_DOMAIN` (en `.env.example`), no `QR_DOMAIN`. Vacía = origen actual de la app.
- `Property.serviceUrls` y `buildServiceUrl(property, service, domain)` reciben el dominio como argumento en lugar de leer el entorno.
- Los tests corren con `bun run test` (Vitest), no con `bun test`.

## Cómo seguir

Las features nuevas se crean con Spec Kit (`/speckit-specify` → `clarify` → `plan` → `tasks` → `implement`). Estas carpetas son el modelo de formato; los números continúan en `009`.
