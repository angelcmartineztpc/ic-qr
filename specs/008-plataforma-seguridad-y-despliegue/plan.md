# Implementation Plan: Plataforma, seguridad y despliegue

**Branch**: `008-plataforma-seguridad-y-despliegue` (retrospectiva; desarrollada en `integracion-front-back`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-plataforma-seguridad-y-despliegue/spec.md`

## Summary

Infraestructura transversal que cierra la aplicación por defecto. Un esquema Zod valida el entorno al arrancar con reglas fail-closed (`src/server/config`). `withApiGuards` centraliza las defensas de toda ruta `/api` (`src/server/http`) y `src/proxy.ts` autentica las páginas con la misma función. `next.config.ts` fija las cabeceras de seguridad y la salida `standalone`. Un `Dockerfile` de varias etapas produce la imagen en Node 24. Dos scripts instalan y verifican las fuentes con licencia que no se versionan. Vitest, Playwright, ESLint y la constitución de Spec Kit hacen cumplir la calidad. Diseño en [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §S8, §S10, §S11, §S13 y Fase 2 (§G).

## Technical Context

**Language/Version**: TypeScript (`strict` y `noUncheckedIndexedAccess`); Node 24 en la imagen, `engines.node` `>=22.12`; Bun 1.4.2 como gestor (`packageManager`).

**Primary Dependencies** (de `package.json`): `next` 16.3.8, `react` 19.2.8, `zod` ^4.6.5, `fontkit` 2.0.4 y `wawoff2` ^2.0.1 (fuentes), `tsx` ^4.23.15 (scripts `.mts`), `vitest` ^5.0.3, `@vitest/coverage-v8`, `@playwright/test` ^1.63.0, `jsdom`, `@testing-library/*`, `eslint` ^9 con `eslint-config-next` 16.3.8.

**Storage**: no aplica (el storage de QR es la feature 002); aquí solo se validan sus variables.

**Testing**: Vitest en tres proyectos (`unit`: `src/**/*.test.ts`; `dom`: `src/**/*.test.tsx` con jsdom; `integration`: `tests/integration/**/*.test.ts`, `testTimeout` 60 000 ms); `server-only` sustituido por `tests/stubs/server-only.ts`; Playwright en `tests/e2e` con proyectos `desktop` y `mobile` (Pixel 7, 390 × 844).

**Target Platform**: contenedor Linux (`node:24-trixie-slim`); desarrollo en macOS (las rutas de `fonts:setup` por defecto son de macOS).

**Project Type**: aplicación web Next.js (App Router).

**Performance Goals**: no se fijan para esta feature.

**Constraints**: MVP de una réplica (limitadores, semáforos y cuota en memoria); `script-src 'unsafe-inline'` sin nonce (debilidad aceptada, ADR en §S8); cuerpo por defecto 64 KiB.

**Scale/Scope**: límites configurables por variable (`IMPORT_*`, `EXPORT_*`, `RATE_LIMIT_*`) en `env-schema.ts` y `.env.example`.

## Constitution Check

Evaluado contra `.specify/memory/constitution.md` v1.0.0.

| Principio | Resultado |
|---|---|
| I. Una sola fuente de verdad y capas estrictas | Cumple: `env-schema.ts` es la única definición del entorno; ESLint impone las capas con `no-restricted-imports`. |
| II. Regla crítica del QR | No aplica: es la feature 002; aquí solo se validan sus variables y se protegen sus rutas. |
| III. El QR codifica un link estable | No aplica: el redirect es otra feature; solo se documenta como ruta pública exenta. |
| IV. Salida vectorial verificable | No aplica: el pipeline PDF/SVG no forma parte de esta feature; solo se empaquetan las fuentes que usa (`outputFileTracingIncludes`). |
| V. Validación en cada frontera y nada silencioso | Cumple: entorno con Zod y reporte de todos los problemas; cuerpos con `readJsonCapped` y errores con `code`. |
| VI. Seguridad por defecto | Cumple: guardas, `AUTH_MODE=none` bloqueado en producción, `*_FILE`, CSP. Matiz: la constitución nombra solo el redirect como excepción a `withApiGuards`, pero `/api/health` y `/api/storage` también están exentos en código y en §A.5. |
| VII. Tests y calidad como contrato | Cumple con matiz: lint, tipos, 3 proyectos Vitest y umbral del 85 %; `playwright.config.ts` arranca con `npm run build && npm start` aunque la constitución prefiere Bun. |

## Project Structure

### Documentation (this feature)

```text
specs/008-plataforma-seguridad-y-despliegue/
├── spec.md
├── plan.md
├── data-model.md
├── tasks.md
└── contracts/
    ├── guardas-http.md
    └── health.md
```

### Source Code (repository root)

```text
src/
├── instrumentation.ts            # register(): boot() en el runtime nodejs
├── proxy.ts                      # autenticación de páginas (matcher sin /api ni estáticos)
├── server/
│   ├── boot.ts                   # validación al arranque, SIGTERM → apagado ordenado
│   ├── env.ts                    # getEnv() cacheado (server-only)
│   ├── lifecycle.ts              # isDraining / startDraining (globalThis)
│   ├── log.ts                    # logger JSON con redacción
│   ├── config/env-schema.ts      # EnvSchema, parseEnv, FILE_SECRETS
│   └── http/                     # guards, index (withApiGuards, getLimits), auth, origin, rate-limit, semaphore, read-body, errors, content-disposition
└── app/api/health/route.ts       # GET {ok}
next.config.ts                    # CSP, cabeceras, standalone, trazado de fuentes
Dockerfile, .dockerignore, .env.example
scripts/                          # setup-fonts.mts, fonts-lib.mts, hash-password.mts, check-sheetjs.mts, copy-standalone-assets.mjs, render-sample.mts
assets/fonts/{gotham,address-sans}/   # manifest.json y README.md versionados; .woff2 ignorados
vitest.config.mts, playwright.config.ts, eslint.config.mjs
tests/                            # integration/, e2e/, helpers/, stubs/server-only.ts, setup-dom.ts
.specify/                         # memory/constitution.md, templates/, scripts/, workflows/
```

**Structure Decision**: seguridad y configuración son código solo de servidor (`src/server`, con `server-only`), salvo `env-schema.ts` y `auth.ts` que se mantienen puros para poder usarse desde `src/proxy.ts` y desde los tests. Los tests de guardas inyectan su configuración (`createApiGuards`) sin tocar el entorno.

## Decisiones de diseño verificadas en código

- **Guardas diferidas**: `getGuards()` y `getLimits()` se crean en la primera petición; `next build` no evalúa el entorno.
- **Arranque**: `src/instrumentation.ts` llama a `boot()` solo si `NEXT_RUNTIME === "nodejs"`; en producción un fallo termina el proceso.
- **Apagado ordenado**: el estado vive en `globalThis` con `Symbol.for("qr-production-generator.draining")` porque `instrumentation.ts` y los handlers se empaquetan por separado. Lo usan `/api/export` e `/api/import/excel` con `rejectWhenDraining: true`.
- **Autenticación**: `basic` compara con `timingSafeEqual` sobre el SHA-256 de ambos lados; `proxy` exige `X-Proxy-Auth`.
- **Cabeceras de API**: `next.config.ts` aplica `Cross-Origin-Resource-Policy: same-origin` y `Cache-Control: no-store` a `/api/:path((?!storage/).*)`.
- **Standalone**: `scripts/copy-standalone-assets.mjs` copia `.next/static`, `public` y `assets/fonts` tras `next build` (el script `build` lo encadena).
- **Fuentes**: `setup-fonts.mts` recorre las familias `gotham` y `address-sans`; `scanFonts` explora hasta 4 niveles y archivos de 8 000 a 3 000 000 bytes.
- **Spec Kit**: `.specify/init-options.json` registra `speckit_version` 1.1.1; hay integraciones `copilot` y `claude` instaladas (`.specify/integration.json`).

## Complexity Tracking

Sin violaciones de la constitución que justificar (los matices de la tabla son incongruencias documentales o de herramienta, no excepciones al código).
