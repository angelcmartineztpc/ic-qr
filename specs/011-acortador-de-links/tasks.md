# Tareas: Acortador de links del menú

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Marcar `[x]` solo con la verificación indicada. Las `[ ]` son trabajo pendiente real o verificaciones manuales.

## Fase A · Acortador (implementada)

### Núcleo y servidor
- [x] **T-001** Esquemas de links: código, registro, peticiones y respuestas (`src/schemas/links.ts`). Verificación: `bun run typecheck`.
- [x] **T-002** Código determinista y alfabeto de 31 caracteres (`src/server/links/code.ts`). Verificación: `src/server/links/links.test.ts` (determinismo, alfabeto, 5000 links sin repetir).
- [x] **T-003** Interfaz `ShortLinkRepository` y `ObjectShortLinkRepository` (`src/server/links/`). Verificación: `links.test.ts` (crea sin pisar, prefijo, archivo dañado).
- [x] **T-004** Claves de storage: `isManagedKey` frente a `isValidKey` (`src/server/storage/keys.ts`). Verificación: `links.test.ts` y `tests/integration/api-links.test.ts` (`/api/storage` no sirve `s/v1/*.json`).
- [x] **T-005** Servicio: acortar (idempotente, colisiones, carreras, links propios), leer y cambiar destino con historial y revisión (`src/server/links/service.ts`). Verificación: `links.test.ts` (22 casos).
- [x] **T-006** Caché del redirect (`src/server/links/redirect-cache.ts`). Verificación: `links.test.ts`.
- [x] **T-007** `GET /s/{código}` público + exclusión en `src/proxy.ts`. Verificación: `tests/integration/api-links.test.ts` (302, 404, mayúsculas) y E2E `links.spec.ts` (sin sesión).
- [x] **T-008** `POST /api/links/shorten`, `GET`/`PATCH /api/links/{código}` con `withApiGuards` y `RATE_LIMIT_LINKS_PER_MIN`. Verificación: `api-links.test.ts` (400/401/403/404/409/415).
- [x] **T-009** `POST /api/records/excel` (Excel actualizado). Verificación: `src/server/links/excel.test.ts` y `api-links.test.ts`.
- [x] **T-010** `MenuUrlSchema` acepta el link corto de `localhost`/`127.0.0.1` solo en esa forma exacta (desarrollo). Verificación: `src/schemas/menu-url.test.ts`.

### Interfaz
- [x] **T-020** Cliente (`links-client.ts`, `shorten-many.ts`) y `fetchShorten` en el `Runtime`. Verificación: `shorten-many.test.ts` (lotes de 200, vacíos y repetidos, fallo lanza).
- [x] **T-021** Importación: acortar en `confirm()` antes de crear piezas; un fallo aborta sin crear nada y ofrece reintentar. Verificación: `import-actions.test.ts` («acortar los links del menú al confirmar»).
- [x] **T-022** Formulario: `prepareDraft()` (no acorta un link que no se tocó al editar). Verificación: `builder-actions.test.ts`.
- [x] **T-023** Detalle de la pieza: destino vigente y «Cambiar destino». Verificación: `LinkDestination.test.tsx`; E2E `links.spec.ts`.
- [x] **T-024** Aviso previo en la importación («los N links del menú se acortarán») y botón «Descargar Excel actualizado» (resultado, notificación y menú ⋮ de Piezas). Verificación: E2E `links.spec.ts`; `builder-actions.test.ts` (`downloadExcel`).
- [x] **T-025** Constitución (III y VI), README, ARCHITECTURE, `.env.example`. Verificación: revisión.
- [ ] **T-026** Prueba manual con un Excel real del cliente (links largos reales) y con un teléfono real leyendo el QR corto grabado en el material.

### Verificación global
- [x] **T-030** `bun run lint` (0 errores), `bun run typecheck`, `bun run test`. Resultado en `CHANGELOG.md`.
- [x] **T-031** `bun run test:e2e` completo. Resultado en `CHANGELOG.md`.

## Mejoras identificadas (no hechas)
- [ ] **T-090** Duplicados: comparar por destino (consulta de solo lectura) para que importar el Excel **original** tras el actualizado detecte las piezas ya importadas.
- [ ] **T-091** Acción «Acortar links del proyecto» para piezas anteriores a esta funcionalidad (cambiaría el QR de piezas posiblemente impresas: pide confirmación y regenera con la regla existente de «QR desactualizado»).
- [ ] **T-092** Acortar también el link estable de resort/servicio si se quiere un solo estándar (hoy se conserva: ya es corto y central).
- [ ] **T-093** Decidir el **dominio corto** (24 caracteres frente a ≈ 48 con el dominio de la aplicación).
- [ ] **T-094** Registro de clics por link (opcional).

## Fase B · Supabase e integración con la plataforma (pendiente de la integración)
- [ ] **T-100** Migración SQL versionada (`supabase/migrations/`) a partir de [`contracts/supabase-short-links.sql`](contracts/supabase-short-links.sql) y políticas RLS con el modelo de roles real.
- [ ] **T-101** `SupabaseShortLinkRepository` (solo servidor) y selección con `LINKS_REPOSITORY=supabase`.
- [ ] **T-102** Registrar cada QR generado en `qr_assets` (quién y cuándo).
- [ ] **T-103** Bucket privado para las imágenes de los QR con URLs firmadas de corta vida o ruta autenticada; el redirect `/s/` sigue público.
- [ ] **T-104** Sesión de la plataforma en lugar del acceso básico (`AUTH_MODE=proxy`); permisos por rol para crear y cambiar destinos.
- [ ] **T-105** Pruebas contra un Supabase local (`supabase start`) en CI.
- [ ] **T-106** Verificar contra un Supabase real: escritura sin PUT condicional, metadatos y permisos.
