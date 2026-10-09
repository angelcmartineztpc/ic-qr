# Specs

Features F001–F004 se escribieron en la rama `qr-api-created`, cuando el código vivía en `app/`, `lib/` y `data/`. Tras la integración con `integracion-front-back` ese código se reemplazó por `src/`. Las specs se conservan como registro de las decisiones; este mapa indica dónde está hoy cada cosa.

| Spec | Tema | Dónde vive hoy |
|---|---|---|
| F001 | Propiedades (resorts, servicios, destinos) | `src/lib/resorts/properties.ts` (+ test) |
| F002 | Generación de QR | `src/lib/qr`, `src/server/qr` y `POST /api/qr/resolve` (regla crítica: ver `docs/ARCHITECTURE.md` §S2) |
| F003 | Etiqueta y exportación | `src/lib/document`, `src/server/export`, `src/server/pdf` y `POST /api/export` (pieza de 70 × 70 mm, no 50 × 50) |
| F004 | URL estable del QR + redirect | `src/app/api/qr/[resortCode]/[service]/route.ts`; selector en `src/components/forms/ResortLinkPicker.tsx` |

Diferencias respecto al texto de las specs:

- La variable del dominio es `NEXT_PUBLIC_QR_DOMAIN` (en `.env.example`), no `QR_DOMAIN`. Vacía = origen actual de la app.
- `Property.serviceUrls` y `buildServiceUrl(property, service, domain)` reciben el dominio como argumento en lugar de leer el entorno.
- Los tests corren con `bun run test` (Vitest), no con `bun test`.

Las features nuevas se crean con Spec Kit (`/speckit-specify`) y la constitución vigente está en `.specify/memory/constitution.md`.
