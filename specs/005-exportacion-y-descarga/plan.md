# Implementation Plan: Exportación y descarga

**Branch**: `005-exportacion-y-descarga` (retrospectiva; se desarrolló en `integracion-front-back`) | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-exportacion-y-descarga/spec.md`

## Summary

`POST /api/export` recibe una proyección mínima de las piezas incluidas, valida todo con Zod, comprueba plantilla, fuentes e identidad del QR antes de abrir el stream, y después construye la escena de cada pieza (spec [004](../004-piezas-vectoriales-y-plantillas/spec.md)), la dibuja en un PDF con pdfkit y, si se pide, en un ZIP de SVG con `fflate`. La respuesta es un stream de tramas binarias (progreso, metadatos, trozos de 64 KB, avisos, `DONE`, `ERROR`). El cliente (`runExportJob`) las lee, informa de las fases, reúne los archivos en `Blob` y los descarga; la interfaz (paso Exportar) añade opciones, visor tipo lector de PDF, diálogo de bloqueos, progreso y cancelación. Desde el 2026-10-09 el texto es vivo por defecto para que sea editable en Illustrator.

Decisiones de fondo: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §A.5 (solo Route Handlers y guardas), §A.6 (pipeline), §S5 (protocolo y UI de descarga), §E.9 (ZIP) y las notas de las Fases 9 y 10.

## Technical Context

**Language/Version**: TypeScript 5 estricto; Node `>=22.12` (`engines`), build y runtime en Node 24 según la constitución.

**Primary Dependencies** (verificadas en `package.json`): `next` 16.3.8, `react` 19.2.8, `zod` ^4.6.5, `pdfkit` 0.20.2, `fontkit` 2.0.4, `fflate` ^0.8.3, `@mui/material` ^9.4.0, `zustand` ^5.0.15, `@tanstack/react-virtual` ^3.14.13 (virtualización del visor). Sin dependencias nuevas.

**Storage**: Solo lectura del storage de QR (local o S3) durante la exportación; el PDF y el ZIP se acumulan en memoria (sin temporales). Estado de la descarga en el store de sesión (`generation`); opciones de exportación en el proyecto (`exportOptions`, IndexedDB).

**Testing**: Vitest 5 (`unit`, `dom`, `integration`) y Playwright (`bun run test:e2e`; `tests/e2e/export.spec.ts`, `export-1000.spec.ts`). Las pruebas de integración se saltan sin la fuente (`HAS_PIECE_FONT`).

**Target Platform**: Servidor Node (Route Handler) y navegador (cliente y visor).

**Project Type**: Aplicación web Next.js (App Router).

**Performance Goals**: 1000 piezas con QR, PDF y descarga en una prueba E2E que comprueba 167 páginas; las cifras medidas (10.5 s, 2500 piezas en 10.8 s) vienen de las notas de las Fases 9 y 10 y no se repitieron para este documento.

**Constraints**: máximo 5000 registros, cuerpo de 8 MiB, 2 exportaciones simultáneas por instancia sin cola, 6 solicitudes por minuto, `EXPORT_TIMEOUT_MS` 60 000; límites configurables por entorno (`.env.example`).

**Scale/Scope**: una ruta, un cliente, 6 componentes del paso Exportar (`ExportScreen`, `PdfOptionsPanel`, `PdfViewer`, `DownloadProgress`, `GenerationStatus`, `ExportBlockersDialog`) más `FileNameInput`.

## Constitution Check

Contra `.specify/memory/constitution.md` v1.0.0:

- **I. Una sola fuente de verdad y capas estrictas**: cumple. `src/lib/export` es isomórfico y sin DOM (`frames`, `client`, `build-request`, `file-name`); `src/server/export` lleva `server-only`; los componentes solo importan `src/lib`.
- **II. Regla crítica del QR**: cumple. La exportación no genera ni sube nada (storage tipado como solo lectura, prueba de storage idéntico), recalcula la exportabilidad con `ExportRecordSchema` y verifica la identidad del QR de cada pieza; los fallos son por pieza (`recordId`).
- **III. El QR codifica un link estable**: no aplica. La exportación usa el QR ya resuelto.
- **IV. Salida vectorial verificable**: cumple en pruebas automáticas (0 imágenes, QR único, texto vivo o contornos). La verificación con `docs/ILLUSTRATOR.md` es manual y está pendiente.
- **V. Validación en cada frontera y nada silencioso**: cumple. `ExportRequestSchema.safeParse` con 400 e issues; avisos de composición como tramas `WARNING` y conteo en `DONE`; mensajes en español.
- **VI. Seguridad por defecto**: cumple. Ruta con `withApiGuards` (host, auth, `Content-Type` y origen, drenaje, rate limit, semáforo, tamaño); sin `fs` con entrada de usuario; el texto del usuario se escapa en el SVG (spec 004).
- **VII. Tests y calidad como contrato**: cumple con tests de integración, unitarios, de componentes y E2E por historia. No se auditó para este documento la ausencia de `any` ni de `eslint-disable`.

Restricciones adicionales: Estilos. `PdfViewer` usa clases Tailwind con colores literales (`bg-[#525659]`, `bg-[#323639]`, `bg-[#2b2e30]`); la regla habla de `sx`/`style`, y si esas clases cuentan como literales de color no se ha verificado.

## Project Structure

### Documentation (this feature)

```text
specs/005-exportacion-y-descarga/
├── spec.md
├── plan.md
├── tasks.md
└── contracts/
    └── export-api.md
```

### Source Code (estado real)

```text
src/
├── app/
│   ├── api/export/route.ts            # Route Handler (guardas, validación, stream)
│   ├── api/preview/tiles/route.ts     # piezas dibujadas para el visor y el SVG de una pieza
│   └── export/                        # página del paso 3 (renderiza ExportScreen)
├── schemas/{export.ts,pdf.ts,record.ts}
├── lib/export/
│   ├── frames.ts                      # protocolo de tramas (isomórfico)
│   ├── client.ts                      # runExportJob, errores del cliente
│   ├── build-request.ts               # proyección, bloqueos, nombre
│   ├── file-name.ts                   # saneado, nombre por defecto, entradas del ZIP
│   └── save-blob.ts                   # descarga de un Blob
├── server/export/{run-export.ts,zip.ts}
├── server/pdf/writer.ts               # (spec 004)
├── components/editor/
│   ├── ExportScreen.tsx  PdfOptionsPanel.tsx  PdfViewer.tsx
│   ├── DownloadProgress.tsx  GenerationStatus.tsx  ExportBlockersDialog.tsx
│   ├── FileNameInput.tsx
│   └── export-actions.ts  useExportActions.ts
├── components/records/builder-actions.ts   # downloadPieceSvg
└── lib/state/project.ts                    # exportOptions por defecto
tests/
├── integration/export.test.ts
└── e2e/{export.spec.ts,export-1000.spec.ts}
docs/ILLUSTRATOR.md  scripts/{render-sample.mts,illustrator-check.jsx}
```

Pruebas unitarias y de componentes: `src/lib/export/{frames,client,build-request,file-name}.test.ts`, `src/components/editor/{export-actions.test.ts,ExportScreen.test.tsx,PdfViewer.test.tsx}`, `src/components/records/builder-actions.test.ts`.

**Structure Decision**: separación estricta isomórfico/servidor: el protocolo y el cliente viven en `src/lib/export`, la generación en `src/server/export`, y la interfaz solo depende del cliente (`runExportJob`, inyectable en `createExportActions` para probar sin red).

## Diferencias entre docs y código (a tener en cuenta)

- §E.9 dice que el ZIP se llama `{fileName}_SVG.zip`; el código lo nombra `<fileName>.zip`.
- §E.9 dice que el SVG de una pieza se genera en el cliente con `renderSceneSvg`; el código lo pide al servidor (`/api/preview/tiles`, `downloadPieceSvg`), con el texto en contornos.
- §S5 dice que `saveBlob` revoca la URL a los 60 s; el código la revoca en el siguiente ciclo (`setTimeout(..., 0)`).
- §E.3 muestra siempre la capa `background`; `tropical-table` no declara fondo de pieza, así que su SVG trae `artwork`, `qr` y `text` (y `cutline` si se pide).
- §E.6 deja CMYK y `CutContour` «activables»: existen en el esquema y en el PDF, pero `PdfOptionsPanel` no los muestra.
- El comentario de `src/app/api/preview/tiles/route.ts` aún habla de «contornos de Gotham».
