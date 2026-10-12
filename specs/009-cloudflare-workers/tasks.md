# Tasks: Despliegue en Cloudflare Workers

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 1: Setup

- [x] T001 Instalar `@opennextjs/cloudflare` y `wrangler`; autorizar el `postinstall` de `workerd` en `package.json`
- [x] T002 Crear `open-next.config.ts` y `wrangler.jsonc` (`nodejs_compat`, assets, binding `QR_BUCKET`, `limits.cpu_ms`)
- [x] T003 Añadir los scripts `cf:build`, `cf:preview`, `cf:fonts`, `cf:deploy` en `package.json`
- [x] T004 Ignorar `.dev.vars`, `.open-next/` y `.wrangler/` en `.gitignore`; añadir `.dev.vars.example`

## Phase 2: US2 — QR y fuentes en R2 (P1)

- [x] T005 `R2StorageProvider` y `cloudflareBucket()` en `src/server/storage/r2.ts`
- [x] T006 Registrar `"r2"` en `src/server/storage/index.ts`, `src/types/storage.ts` y `src/server/config/env-schema.ts`
- [x] T007 `/api/storage/**` sirve con `local` y `r2` (`src/app/api/storage/[...key]/route.ts`)
- [x] T008 Bucket simulado `tests/helpers/fake-r2-bucket.ts` y contrato de R2 en `src/server/storage/storage.test.ts`
- [x] T009 Carga de fuentes desde `fonts/` de R2: `src/server/fonts/index.ts` y `node-font-registry.ts` (`ready()`, `addBytes()`)
- [x] T010 `pdfkit`: incrustar desde bytes y no cargar Helvetica (`src/server/pdf/writer.ts`)
- [x] T011 Las rutas de exportación y vista previa esperan las fuentes (`getReadyFontRegistry`)
- [x] T012 Script `scripts/upload-fonts-r2.mts` (local y `--remote`)

## Phase 3: US1 — Exportar en el Worker (P1)

- [x] T013 Ceder el turno con `setTimeout` en `src/server/export/run-export.ts`
- [x] T014 Probar en `wrangler dev`: salud, 401/200, redirect 302/404, páginas 200, estáticos y fuentes de la interfaz
- [x] T015 Probar en `wrangler dev`: resolver QR, reutilizar, servir SVG, exportar PDF y ZIP en texto vivo y en contornos, vista previa
- [x] T016 Medir 300 piezas (resolver 0.8 s; exportar 2.2 s / 2.8 s) y revisar el PDF (0 imágenes, fuente incrustada, `#000000`)

## Phase 4: US3 — Excel sin hilos (P2)

- [x] T017 Extraer la lectura a `src/server/excel/parse-core.mjs` y usarla en el hilo y en la petición
- [x] T018 `openWorkbook` elige el camino según la plataforma (`src/server/excel/read-workbook.ts`) y `next.config.ts` traza `parse-core.mjs`
- [x] T019 Test del camino sin hilos `src/server/excel/read-workbook.test.ts`; importar un libro real en `wrangler dev` (2 válidas, 1 con error)

## Phase 5: US4 — Verificación sin `sharp` (P2)

- [x] T020 Cargar `sharp` bajo demanda y fallar con `unsupported-type` si no existe (`src/server/qr/verify-existing.ts`)
- [x] T021 Test `src/server/qr/verify-existing.no-sharp.test.ts`

## Phase 6: Documentación

- [x] T022 Sección «Cloudflare Workers» en `README.md`, `.env.example` y este `specs/009-cloudflare-workers/`

## Pendientes

- [ ] T023 Publicar en una cuenta real: login, crear bucket, `cf:fonts -- --remote`, variables y `cf:deploy` (necesita al titular de la cuenta)
- [ ] T024 Probar límites reales de memoria y CPU con una exportación grande
- [ ] T025 Verificar `onlyIf.etagDoesNotMatch: "*"` y el servicio de objetos contra R2 real
- [ ] T026 Decidir el dominio definitivo (`STORAGE_PUBLIC_BASE_URL` queda grabado en los `qrUrl`)
- [ ] T027 Confirmar las licencias de Address Sans Pro Cd y Gotham para este uso
- [ ] T028 (opcional) Verificar QR existentes en Workers con `resvg-wasm`

## Evidencia

```bash
bun run test        # 929 tests
bun run lint && bun run typecheck && bun run build
bun run cf:build && bun run cf:preview   # y probar contra http://localhost:8787
```
