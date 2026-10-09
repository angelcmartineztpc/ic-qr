# Tasks: Resolución de QR y storage

**Input**: `/specs/002-qr-resolucion-y-storage/` (spec.md, plan.md, data-model.md, contracts/)

**Prerequisites**: plan.md, spec.md

**Tests**: incluidos; cada tarea marcada `[x]` tiene archivo existente y test o commit como evidencia. Retrospectiva: las tareas se implementaron en el commit `05f7991` (Fase 5) salvo donde se indica.

**Format**: `[ID] [P?] [Story] Descripción con ruta`

## Phase 1: Setup (infraestructura compartida)

- [x] T001 Definir las variables `STORAGE_*`, `QR_*` y los límites de la feature con reglas de arranque en `src/server/config/env-schema.ts` (test: `src/server/config/env-schema.test.ts`)
- [x] T002 [P] Declarar los tipos del contrato de storage en `src/types/storage.ts`
- [x] T003 [P] Declarar `QrSourceInfoSchema`, `QrAckSchema` y `QrErrorCodeSchema` en `src/schemas/record.ts` y el esquema de petición y respuesta en `src/schemas/api.ts` (test: `src/schemas/schemas.test.ts`)

## Phase 2: Foundational (bloquea las historias)

- [x] T004 Implementar codificación, renderer canónico, `hashInput` y versión del renderer en `src/lib/qr/` (commits `005ba21`, `05f7991`; test con hash dorado: `src/lib/qr/qr.test.ts`)
- [x] T005 Implementar claves, `KEY_PATTERN`, `keyFromPublicUrl` y `StorageError` en `src/server/storage/keys.ts` (test: `src/server/storage/storage.test.ts`)
- [x] T006 [P] Implementar el proveedor local con enlace atómico y metadatos en `src/server/storage/local.ts`
- [x] T007 [P] Implementar el proveedor S3-compatible en `src/server/storage/s3.ts`
- [x] T008 Implementar la factory, el singleton y el límite global de concurrencia en `src/server/storage/index.ts` y `src/server/storage/limited.ts`
- [x] T009 Implementar `HourlyQuota` en `src/server/qr/quota.ts` y la composición en `src/server/qr/services.ts`

**Checkpoint**: contrato de `StorageProvider` verde para disco y S3 simulado (`src/server/storage/storage.test.ts`).

## Phase 3: User Story 1 - Un QR por menú, sin duplicados (P1)

- [x] T010 [US1] Implementar `resolveGenerate`, `ensureAsset` y deduplicación por clave en `src/server/qr/resolve.ts` (test: `src/server/qr/resolve.test.ts`)
- [x] T011 [US1] Implementar `contentHashOf` y `sha256Hex` en `src/server/qr/hash.ts` (test: `src/server/qr/hash.test.ts`)
- [x] T012 [US1] Exponer `POST /api/qr/resolve` en `src/app/api/qr/resolve/route.ts` (contrato: `contracts/qr-resolve.md`; test: `tests/integration/api-qr.test.ts`)
- [x] T013 [US1] Implementar el caso de uso del cliente en `src/lib/app/resolve-qrs.ts` (test: `src/lib/app/resolve-qrs.test.ts`)

## Phase 4: User Story 2 - Con Link del QR nunca se genera (P1)

- [x] T014 [US2] Implementar `isPublicAddress` en `src/server/net/is-public-address.ts` y `safeFetch` en `src/server/net/safe-fetch.ts` (test: `src/server/net/safe-fetch.test.ts`)
- [x] T015 [US2] Implementar el saneado con lista blanca en `src/server/qr/sanitize-svg.ts` (test: `src/server/qr/sanitize-svg.test.ts`)
- [x] T016 [US2] Implementar `classifyAsset` y `verifyExistingQr` con rasterizado del SVG re-emitido en `src/server/qr/verify-existing.ts` (test: `src/server/qr/verify-existing.test.ts`)
- [x] T017 [US2] Rechazar ítems con `qrUrl` o `qr` en `parseItem` de `src/server/qr/resolve.ts` (test: bloque «REGLA CRÍTICA» de `src/server/qr/resolve.test.ts`)
- [x] T018 [US2] Exponer `GET /api/qr/asset` en `src/app/api/qr/asset/route.ts` (contrato: `contracts/qr-asset.md`; test: `tests/integration/api-qr.test.ts`)
- [ ] T019 [US2] Detectar el cambio de `assetSha256` al re-verificar (`asset-changed`, `QR_ASSET_CHANGED` de §S2.4) y la caché LRU por `qrUrl` + `ETag`: no hay implementación en `src/server/qr`

## Phase 5: User Story 3 - Stale y bloqueo (P1)

- [x] T020 [US3] Implementar `resolveQrDecision`, `deriveQrStatus`, `qrBlocker`, `isExportable`, `makeAck` y `canApplyResolution` en `src/lib/records/qr-state.ts` (commit `f794758`; test: `src/lib/records/qr-state.test.ts`)
- [x] T021 [US3] Implementar `ackValid` en `src/schemas/record.ts` (test: `src/lib/records/qr-state.test.ts`)
- [x] T022 [US3] Cubrir el flujo editar menú, bloqueo, mantener y desbloqueo sin crear archivos en `tests/integration/qr-pipeline.test.ts`

## Phase 6: User Story 4 - El servidor no confía en el cliente (P1)

- [x] T023 [US4] Implementar `verifyQrIdentity` en `src/server/qr/identity.ts` (test: `src/server/qr/identity.test.ts`)
- [x] T024 [US4] Implementar `materializeQrGeometry` en `src/server/qr/materialize.ts` (test: `src/server/qr/identity.test.ts`)
- [x] T025 [US4] Cubrir el flujo completo (crear, resolver, verificar identidad, materializar, re-exportar) en `tests/integration/qr-pipeline.test.ts`
- [ ] T026 [US4] Comprobación opcional de existencia por exportación (`EXPORT_VERIFY_EXISTS`, §S2.5): la variable no existe en `src/server/config/env-schema.ts`

## Phase 7: User Story 5 y 6 - Storage seguro y cuota (P2)

- [x] T027 [P] [US5] Exponer `GET /api/storage/[...key]` solo con proveedor local en `src/app/api/storage/[...key]/route.ts` (contrato: `contracts/storage-get.md`; test: `tests/integration/api-qr.test.ts`)
- [x] T028 [P] [US5] Servidor S3 falso con `412` y modo sin PUT condicional en `tests/helpers/fake-s3-server.ts`
- [x] T029 [US6] Resolver conflictos (`storage-conflict`) y cuota (`quota-exceeded`) en `src/server/qr/resolve.ts` (test: bloque «objetos ajenos y cuota» de `src/server/qr/resolve.test.ts`)
- [x] T030 [US6] Exigir `QR_FETCH_DIRECT_EGRESS_CONFIRMED` con proxy de salida y rechazar storage local con base http/localhost en producción (`src/server/config/env-schema.ts`; test: `src/server/config/env-schema.test.ts`)
- [ ] T031 [US5] Pruebas opcionales contra Cloudflare R2 y Supabase reales (Fase 11 del plan): no existen en `tests/`

## Evidencia

Comandos de verificación (no se reejecutaron al redactar este documento; el responsable indica 917 tests pasando):

```bash
bun run test                                   # Vitest: unit, dom, integration
bunx vitest run src/server/qr src/server/storage src/server/net src/lib/records/qr-state.test.ts
bunx vitest run tests/integration/api-qr.test.ts tests/integration/qr-pipeline.test.ts
bun run lint && bun run typecheck
```

Commits relevantes (`git log --oneline`):

- `05f7991` feat: fase 5 — QR y storage: la regla crítica de extremo a extremo
- `005ba21` feat: fase 4 — núcleo vectorial: QR, texto, escena, SVG y PDF
- `f794758` feat: fase 3 — modelo de dominio y validación
- `a8639bc` feat: fase 1 (arquitectura) y fase 2 (scaffolding, infraestructura y guardas)
- `a9d8456` wip: backup del estado antes de cambiar de cuenta Claude
