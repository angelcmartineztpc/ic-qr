# Implementation Plan: Despliegue en Cloudflare Workers

**Branch**: `009-cloudflare-workers` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

Ejecutar la app como Worker con `@opennextjs/cloudflare` sin tocar el camino de Docker/Node. Se sustituye solo lo que depende de Node: almacenamiento (nuevo proveedor R2), carga de fuentes (desde R2), lectura de Excel (sin hilos) y la verificación de QR existentes (degradada con error explícito).

## Technical Context

**Language/Version**: TypeScript estricto, Next.js 16.3.8, React 19.2.8

**Primary Dependencies (nuevas, de desarrollo)**: `@opennextjs/cloudflare` 1.20 (soporta `next >=16.3.8`) y `wrangler` 4.149. Se autorizó el `postinstall` de `workerd` (`trustedDependencies`).

**Storage**: Cloudflare R2 por binding `QR_BUCKET` (`STORAGE_PROVIDER=r2`)

**Testing**: Vitest (contrato de storage con un bucket R2 simulado en `tests/helpers/fake-r2-bucket.ts`) y pruebas manuales contra `wrangler dev`

**Target Platform**: Cloudflare Workers (`nodejs_compat`, `compatibility_date` 2026-10-01)

**Constraints**: paquete ≈ 4.3 MB comprimido (plan de pago); memoria y CPU por petición de Workers; sin `sharp`, sin `worker_threads`, sin disco

## Constitution Check

- **I. Capas**: cumple. El adaptador vive en `src/server/storage/r2.ts`; `src/lib` no importa nada de Cloudflare.
- **II. Regla crítica del QR**: cumple. Sin `sharp` nunca se genera ni se guarda un QR; falla visible (`unsupported-type`).
- **III. Link estable**: no aplica; la ruta de redirect no cambia.
- **IV. Salida vectorial**: cumple. Misma salida que en Node (0 imágenes, tinta `#000000`).
- **V. Validación y nada silencioso**: cumple. La verificación no disponible se informa; la carga de fuentes fallida se reintenta y se reporta.
- **VI. Seguridad**: cumple con matiz. Mismas guardas; las fuentes de las piezas no se sirven (`/api/storage` solo acepta claves de QR). Pendiente: el middleware de Node es experimental en OpenNext.
- **VII. Tests y calidad**: cumple. 929 tests; lint y typecheck sin errores.
- **Dependencias nuevas**: justificadas arriba (adaptador oficial y CLI).
- **Fuentes**: cumple. No se versionan; `cf:fonts` las sube a un bucket privado.

## Project Structure

### Documentation

```text
specs/009-cloudflare-workers/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code

```text
open-next.config.ts                     # defineCloudflareConfig({}) — sin ISR ni imágenes
wrangler.jsonc                          # nombre, nodejs_compat, assets, binding QR_BUCKET, limits.cpu_ms
.dev.vars.example                       # variables de prueba (el .dev.vars real está en .gitignore)
scripts/upload-fonts-r2.mts             # bun run cf:fonts [-- --remote]
src/server/storage/r2.ts                # R2StorageProvider + cloudflareBucket()
src/server/storage/index.ts             # fábrica: "r2"
src/server/fonts/index.ts               # fuentes desde R2 + getReadyFontRegistry()
src/server/fonts/node-font-registry.ts  # ready() / addBytes(); bytes en LoadedFont
src/server/pdf/writer.ts                # incrusta desde bytes; font: null (sin Helvetica)
src/server/export/run-export.ts         # nextTick con setTimeout
src/server/excel/parse-core.mjs         # lectura SheetJS compartida
src/server/excel/read-workbook.ts       # camino sin hilos
src/server/qr/verify-existing.ts        # sharp perezoso; error visible sin él
src/app/api/storage/[...key]/route.ts   # local y r2
tests/helpers/fake-r2-bucket.ts
```

**Structure Decision**: cambios aditivos y detrás de una condición de entorno o de plataforma; el camino de Node/Docker conserva su comportamiento y sus tests.

## Cómo se publica (no ejecutado)

1. `bunx wrangler login` y `bunx wrangler r2 bucket create qr-production-generator-qr`.
2. `bun run cf:fonts -- --remote`.
3. Variables y secretos: `AUTH_MODE=basic`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD_SHA256`, `APP_ORIGINS`, `APP_ALLOWED_HOSTS`, `STORAGE_PROVIDER=r2`, `STORAGE_PUBLIC_BASE_URL=https://<dominio>/api/storage`.
4. `bun run cf:deploy`. El dominio de `STORAGE_PUBLIC_BASE_URL` queda grabado en los `qrUrl`; conviene fijar el definitivo antes (ver spec 007).
