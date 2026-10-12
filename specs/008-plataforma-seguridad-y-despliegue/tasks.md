# Tasks: Plataforma, seguridad y despliegue

**Input**: `/specs/008-plataforma-seguridad-y-despliegue/` (spec.md, plan.md, data-model.md, contracts/)

**Prerequisites**: plan.md, spec.md

**Tests**: incluidos; una tarea se marca `[x]` solo con archivo existente y test o commit como evidencia. Retrospectiva: la base se implementó en el commit `a8639bc` (Fase 2) y se amplió después.

**Format**: `[ID] [P?] [Story] Descripción con ruta`

## Phase 1: Setup

- [x] T001 Inicializar el proyecto Next.js con ESLint, TypeScript y Tailwind (commit `db45fbf`)
- [x] T002 [P] Fijar `packageManager` (`bun@1.4.2`), `engines` y scripts en `package.json`; `bun.lock` como único lockfile (`.gitignore` excluye `package-lock.json`)
- [x] T003 [P] Documentar todas las variables en `.env.example` (última modificación: `6da1e64`)

## Phase 2: Foundational

- [x] T004 Definir `EnvSchema`, `parseEnv` y `FILE_SECRETS` en `src/server/config/env-schema.ts` (test: `src/server/config/env-schema.test.ts`)
- [x] T005 Implementar `getEnv()` en `src/server/env.ts` y el logger con redacción en `src/server/log.ts`
- [x] T006 Implementar el arranque fail-closed en `src/server/boot.ts` y `src/instrumentation.ts`, y el apagado ordenado en `src/server/lifecycle.ts`

## Phase 3: User Story 1 - Arranque seguro (P1)

- [x] T007 [US1] Reglas de `superRefine` (autenticación, orígenes y hosts, storage local en producción, proxy de salida) en `src/server/config/env-schema.ts`
- [x] T008 [US1] Cubrir los 9 casos de `parseEnv` en `src/server/config/env-schema.test.ts`
- [x] T009 [US1] Script `scripts/hash-password.mts` (`bun run hash-password`, mínimo 12 caracteres)

## Phase 4: User Story 2 - Guardas HTTP (P1)

- [x] T010 [US2] Implementar `createApiGuards` en `src/server/http/guards.ts` y `withApiGuards`/`getLimits` diferidos en `src/server/http/index.ts` (contrato: `contracts/guardas-http.md`)
- [x] T011 [P] [US2] Implementar `origin.ts`, `rate-limit.ts`, `semaphore.ts`, `read-body.ts`, `errors.ts` y `content-disposition.ts` en `src/server/http/`
- [x] T012 [US2] Cubrir cada código de estado de las guardas en `src/server/http/guards.test.ts` y el token bucket en `src/server/http/rate-limit.test.ts`
- [x] T013 [P] [US2] Exponer `GET /api/health` en `src/app/api/health/route.ts` (contrato: `contracts/health.md`)
- [x] T014 [US2] Prohibir la lectura directa del cuerpo en `src/app/api/**` con una regla de `eslint.config.mjs`

## Phase 5: User Story 3 - Autenticación (P1)

- [x] T015 [US3] Implementar `authenticate` (`none`, `basic`, `proxy`) con comparación de tiempo constante en `src/server/http/auth.ts` (test: `AUTH_MODE=proxy` en `src/server/http/guards.test.ts`)
- [x] T016 [US3] Autenticar páginas en `src/proxy.ts` con matcher que excluye `/api/` y estáticos
- [ ] T017 [US3] Test unitario de `src/proxy.ts`: no existe; solo lo cubren E2E y las pruebas de `authenticate`

## Phase 6: User Story 4 - Cabeceras de seguridad (P2)

- [x] T018 [US4] Definir la CSP y las cabeceras en `next.config.ts`, con `output: "standalone"`, `poweredByHeader: false` y `serverExternalPackages`
- [x] T019 [US4] Comprobar `frame-ancestors 'none'` y la ausencia de `x-powered-by` en `tests/e2e/smoke.spec.ts`
- [x] T020 [P] [US4] Trazar las fuentes y el worker de SheetJS con `outputFileTracingIncludes` en `next.config.ts` y copiar los estáticos con `scripts/copy-standalone-assets.mjs`

## Phase 7: User Story 5 - Docker (P2)

- [x] T021 [US5] Escribir el `Dockerfile` multietapa (Node 24 por digest, Bun solo para instalar, usuario `node`, `HEALTHCHECK`, `STOPSIGNAL SIGTERM`; commits `31a4d2c`, `a8639bc`, `76093b2`, `930885b`)
- [x] T022 [P] [US5] Excluir `.env*`, `.git`, `docs`, `tests/e2e` y datos en `.dockerignore`
- [ ] T023 [US5] Verificar `docker build` y `docker run --read-only --tmpfs /tmp` con `/api/health` 200: no hay evidencia automatizada en el repositorio

## Phase 8: User Story 6 - Fuentes (P2)

- [x] T024 [US6] Implementar `advanceMismatches` y `scanFonts` en `scripts/fonts-lib.mts` (test: `tests/integration/fonts-lib.test.ts`; commit `ae8e4b5`)
- [x] T025 [US6] Implementar `scripts/setup-fonts.mts` (búsqueda en `FONTS_SOURCE_DIR` y caché de Adobe, conversión con `wawoff2`, `--write-manifest`; commits `ae8e4b5`, `2670cc6`)
- [x] T026 [P] [US6] Versionar `assets/fonts/gotham/manifest.json` y `assets/fonts/address-sans/manifest.json` con `sha256`, nombre PostScript y huella de anchos (commits `8a4b100`, `8810065`, `2670cc6`)
- [x] T027 [P] [US6] Excluir los `.woff2` y fuentes de git en `.gitignore` y documentar el procedimiento en `assets/fonts/*/README.md`

## Phase 9: User Story 7 - Calidad y proceso (P3)

- [x] T028 [US7] Configurar Vitest (proyectos `unit`, `dom`, `integration`, cobertura 85 %) en `vitest.config.mts` y el stub `tests/stubs/server-only.ts`
- [x] T029 [P] [US7] Configurar Playwright (escritorio y Pixel 7) en `playwright.config.ts` con specs en `tests/e2e/`
- [x] T030 [P] [US7] Configurar capas, `no-explicit-any`, `ban-ts-comment`, `no-unsafe-*`, `no-alert` y colores literales en `eslint.config.mjs`
- [x] T031 [US7] Ratificar la constitución v1.0.0 en `.specify/memory/constitution.md` y el mapa de specs en `specs/README.md` (commit `e5bb60d`)
- [x] T032 [P] [US7] Instalar la integración de Spec Kit para Claude Code (commit `b1b620c`; `.specify/integration.json`)
- [x] T033 [P] [US7] `scripts/check-sheetjs.mts` (`bun run check:sheetjs`) para vigilar la versión fijada por URL
- [ ] T034 [US7] Alinear `playwright.config.ts` (`npm run build && npm start`) y los matices de la constitución (excepciones a `withApiGuards`) con la práctica documentada

## Evidencia

Comandos de verificación (no se reejecutaron al redactar este documento; el responsable indica 917 tests pasando):

```bash
bun run lint && bun run typecheck && bun run test && bun run build
bunx vitest run src/server/config src/server/http tests/integration/fonts-lib.test.ts
bun run test:e2e                                # requiere navegadores: npx playwright install chromium
bun run fonts:setup                             # verifica manifiestos en la máquina con licencia
curl -i localhost:3000/api/health               # con la app en marcha (README, «Cómo probar la Fase 2»)
```

Commits relevantes (`git log --oneline`):

- `a8639bc` feat: fase 1 (arquitectura) y fase 2 (scaffolding, infraestructura y guardas)
- `31a4d2c` chore: add Dockerfile and .dockerignore for containerization
- `db45fbf` chore: initialize Next.js project with ESLint, TypeScript, and Tailwind CSS configuration
- `e5bb60d` docs: constitución de Spec Kit, README y mapa de specs tras la integración
- `b1b620c` chore: instalar la integración de Claude Code de Spec Kit
- `930885b` chore: fuentes en .woff2 (Gotham y Address Sans Pro)
- `ae8e4b5` feat: fonts:setup busca en la caché de Adobe, convierte a .woff2 y valida la huella de la Cd
- `2670cc6` fix: fonts:setup acepta fuentes ya instaladas con --write-manifest y fija el sha256 de la Cd
- `8a4b100` docs: huella de la Address Sans Pro Cd real tomada del .ai original
- `8810065` fix: no fijar el sha256 de Address Sans con un archivo que no es la versión Cd
