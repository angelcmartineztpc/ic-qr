# Implementation Plan: Resolución de QR y storage

**Branch**: `002-qr-resolucion-y-storage` (retrospectiva; desarrollada en `integracion-front-back`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-qr-resolucion-y-storage/spec.md`

## Summary

La regla crítica del QR se implementa en tres capas. Una decisión pura y compartida (`src/lib/records/qr-state.ts`) dice qué hacer con cada registro. Un servidor que es el único productor de QR (`src/server/qr`, `POST /api/qr/resolve`) genera con claves por contenido o verifica el recurso aportado. Un storage intercambiable (`src/server/storage`, disco local o S3-compatible) guarda los archivos sin duplicar ni pisar. La exportación no escribe ni sale a la red: recalcula la identidad y dibuja lo almacenado. Detalle del diseño en [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §B.2, §B.4, §S2, §S3.

## Technical Context

**Language/Version**: TypeScript estricto (`strict` y `noUncheckedIndexedAccess` en `tsconfig.json`); Node 24 en producción (`engines`: `>=22.12`).

**Primary Dependencies** (verificadas en `package.json`): `next` 16.3.8, `zod` ^4.6.5, `qr` 0.7.2 (matriz y decodificador `qr/decode.js`), `sharp` ^0.35.5 (rasterizado de verificación), `@xmldom/xmldom` ^0.9.12 (parseo de SVG), `ipaddr.js` ^2.5.0 (rangos de IP), `@aws-sdk/client-s3` ^3.1146.0, `server-only`.

**Storage**: archivos `qr/v1/{sha256}.svg` y `qr/ext/v1/{sha256}.json`, con prefijo opcional `STORAGE_KEY_PREFIX`; proveedor `local` (`STORAGE_LOCAL_DIR`, por defecto `./.data/storage`) o `s3`. Sin base de datos.

**Testing**: Vitest 5 (`bun run test`; proyectos `unit` e `integration`), `jsqr` para decodificar en tests de QR, servidor S3 falso en `tests/helpers/fake-s3-server.ts`.

**Target Platform**: servidor Node (Route Handlers sin `runtime` explícito), contenedor Docker.

**Project Type**: aplicación web Next.js (App Router) con núcleo isomórfico en `src/lib` y código solo de servidor en `src/server`.

**Performance Goals**: concurrencia por llamada 16 (`mapWithConcurrency`) bajo el límite global `STORAGE_MAX_CONCURRENCY` (16); verificación de existentes con concurrencia 4 y rasterizado con `sharp.concurrency(1)`.

**Constraints**: lote máximo `QR_RESOLVE_MAX_BATCH` (100); cuerpo ≤512 KiB; descarga externa ≤`QR_FETCH_MAX_BYTES` (524 288) y `QR_FETCH_TIMEOUT_MS` (5000); cuota `QR_MAX_NEW_OBJECTS_PER_HOUR` (2000); MVP de una réplica.

**Scale/Scope**: hasta 5000 piezas por proyecto (`EXPORT_MAX_RECORDS`); el cliente resuelve en trozos de 50 (`chunkSize` de `src/lib/app/resolve-qrs.ts`).

## Constitution Check

Evaluado contra `.specify/memory/constitution.md` v1.0.0.

| Principio | Resultado |
|---|---|
| I. Una sola fuente de verdad y capas estrictas | Cumple: las reglas viven en `src/lib/records/qr-state.ts` (sin `server-only`); `src/server/qr|storage|net` importan `server-only`; ESLint impide que `lib` y `components` importen `server`. |
| II. Regla crítica del QR | Cumple: ítems con `qrUrl`/`qr` fallan con `unsafe-url`; `verifyExistingQr` nunca genera; `verifyQrIdentity` y `materializeQrGeometry` recalculan en servidor sin fallback. |
| III. El QR codifica un link estable | No aplica: el redirect `/api/qr/{resort}/{service}` es otra feature; aquí `menuUrl` es el texto que se codifica. |
| IV. Salida vectorial verificable | Cumple parcialmente por alcance: entrega `QrGeometry` (`matrix` o `external`) al pipeline; el PDF y el SVG por pieza pertenecen a otras features. |
| V. Validación en cada frontera y nada silencioso | Cumple: `QrResolveRequestSchema` estricto con 400 e issues, `ExternalSnapshotSchema` al leer, fallos por pieza con código y mensaje en español. |
| VI. Seguridad por defecto | Cumple: rutas con `withApiGuards` (excepto `/api/storage`, ver Notas), descarga solo con `safeFetch`, SVG saneado con lista blanca, QR generados fuera de git (`/.data/` en `.gitignore`). |
| VII. Tests y calidad como contrato | Cumple: tests unitarios e integración por módulo (ver tabla de estructura); sin `any` ni `@ts-ignore` en `src/server/qr|storage|net`. |

**Notas**: la constitución cita el redirect como única excepción a `withApiGuards`, pero `GET /api/storage/[...key]` y `GET /api/health` también están exentos (`docs/ARCHITECTURE.md` §A.5 lo documenta). Es una incongruencia de redacción de la constitución, no del código.

## Project Structure

### Documentation (this feature)

```text
specs/002-qr-resolucion-y-storage/
├── spec.md
├── plan.md
├── data-model.md
├── tasks.md
└── contracts/
    ├── qr-resolve.md
    ├── qr-asset.md
    └── storage-get.md
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── qr/                    # encode, render-svg, hash-input, version, external (isomórfico)
│   ├── records/qr-state.ts    # decisión pura, estado, ack, guarda de aplicación
│   └── app/resolve-qrs.ts     # caso de uso del cliente (trozos de 50, descarte de resultados)
├── schemas/
│   ├── api.ts                 # QrResolveRequestSchema, QrResolutionSchema
│   ├── qr-geometry.ts         # ExternalGeometrySchema, ExternalSnapshotSchema
│   └── record.ts              # QrSourceInfoSchema, QrAckSchema, QrErrorCodeSchema
├── server/
│   ├── qr/                    # resolve, verify-existing, sanitize-svg, identity, materialize, quota, hash, services, catalog
│   ├── storage/               # index (factory), local, s3, keys, limited
│   └── net/                   # safe-fetch, is-public-address
└── app/api/
    ├── qr/resolve/route.ts
    ├── qr/asset/route.ts
    └── storage/[...key]/route.ts
tests/
├── integration/               # api-qr.test.ts, qr-pipeline.test.ts
└── helpers/                   # fake-s3-server.ts, memory-storage.ts, qr-svg.ts
```

**Structure Decision**: la lógica de decisión es pura y compartida (`src/lib`); todo lo que escribe, descarga o rasteriza es solo de servidor (`src/server`). Los tests unitarios conviven con el código (`*.test.ts`) y los de ruta con guardas están en `tests/integration`.

## Decisiones de diseño verificadas en código

- **Escritura idempotente**: `ensureAsset` hace `upload` con `ifNoneMatch`; con `capabilities.conditionalPut` falso hace `HEAD` antes. `412` se resuelve con `HEAD` y comparación de `svg-sha256`.
- **Metadatos**: `svg-sha256` y `renderer` (`QR_RENDERER_VERSION = "qrsvg-1+qr@0.7.2"`) se guardan como `x-amz-meta-*` en S3 y en un archivo `.meta.json` en disco.
- **Disco local**: archivo temporal y `link` atómico (`EEXIST` = `exists`), metadatos antes que el objeto.
- **Guardas diferidas**: `withApiGuards(handler, () => opciones)` y `getLimits()` se inicializan en la primera petición para que `next build` no evalúe el entorno.
- **Composición**: `getQrServices()` crea una vez el storage, la cuota y la política de hosts (`QR_HOST_POLICY`; con `allowlist` se añade el host de `STORAGE_PUBLIC_BASE_URL`).
- **Variables de entorno de la feature**: `STORAGE_*`, `ALLOW_LOCAL_STORAGE_IN_PROD`, `QR_HOST_POLICY`, `QR_ALLOWED_HOSTS`, `QR_FETCH_*`, `QR_RESOLVE_MAX_BATCH`, `QR_MAX_NEW_OBJECTS_PER_HOUR`, `RATE_LIMIT_RESOLVE_PER_MIN`, `RATE_LIMIT_ASSET_PER_MIN` (todas en `src/server/config/env-schema.ts` y `.env.example`).

## Complexity Tracking

Sin violaciones de la constitución que justificar.
