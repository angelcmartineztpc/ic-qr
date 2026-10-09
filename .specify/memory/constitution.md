# IC-QR (QR Production Generator) Constitution

Herramienta interna para producir piezas físicas de metal con datos de restaurante/mesa y un QR vectorial, exportadas como PDF y SVG compatibles con Adobe Illustrator. El documento normativo de diseño es [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md); su «Registro de decisiones» prevalece sobre el resto. Esta constitución fija las reglas que no se negocian al especificar, planificar o implementar cualquier feature.

## Core Principles

### I. Una sola fuente de verdad y capas estrictas
Cada concepto tiene un único dueño: plantilla = datos Zod + `TemplateOverrides`; layout = mm; render = `TileScene`; reglas de QR = `src/lib/records/qr-state.ts`.
- `src/lib/**` es núcleo puro e isomórfico: sin `fs`, sin `server-only` y sin React.
- `src/server/**` es solo Node y lleva `import 'server-only'` (storage, red, SheetJS, pdfkit, fuentes en disco, guardas HTTP).
- `src/components/**` y `src/lib/**` nunca importan `src/server/**`; ESLint lo impone (`no-restricted-imports`). Un cambio que necesite saltarse una capa se rediseña, no se silencia.

### II. La regla crítica del QR (NON-NEGOTIABLE)
- Con **Link del QR** presente, **nunca** se genera un QR: se verifica el archivo existente.
- Un QR generado se reutiliza (`qr/v1/{sha256}.svg`: el mismo link produce siempre el mismo archivo).
- Si cambia el Link del menú, el QR queda *stale* y bloquea la exportación hasta decidir, con confirmación ligada que caduca.
- **El servidor no confía en el cliente:** recalcula la exportabilidad y la identidad de cada QR. Los fallos son siempre por pieza y nunca provocan una generación de respaldo.

### III. El QR codifica un link estable
El QR grabado en el material no puede reimprimirse barato. Por eso codifica `{dominio}/api/qr/{resortCode}/{service}`, y esa ruta redirige (302, `Cache-Control: no-store`) al destino vigente de `src/lib/resorts/properties.ts`. Cambiar un destino no cambia el QR. El dominio (`NEXT_PUBLIC_QR_DOMAIN`) se graba para siempre: debe ser permanente. Esta ruta es pública y sin autenticación (la abren los huéspedes al escanear); no debe aceptar parámetros de destino arbitrarios. Las otras rutas `/api` sin guardas son `GET /api/health` y, solo con storage local, `GET /api/storage/**`.

### IV. Salida vectorial verificable
- El PDF es vectorial: 0 imágenes, páginas y piezas con medidas exactas en mm, QR como un único path, texto en contornos (o vivo con la fuente incrustada).
- El SVG por pieza cumple `width/height` en mm, ids únicos, una capa por grupo, y nunca imágenes, estilos ni scripts; el texto del usuario jamás inyecta elementos.
- Cualquier cambio en el pipeline (`src/lib/svg`, `src/lib/document`, `src/server/pdf`) conserva esas propiedades con tests y, cuando aplique, con la verificación de [`docs/ILLUSTRATOR.md`](../../docs/ILLUSTRATOR.md).

### V. Validación en cada frontera y nada silencioso
- **Estricta** (reglas de negocio) en HTTP, formulario, filas de Excel y exportación (Zod `safeParse`, 400 con issues).
- **Tolerante** (forma) al hidratar IndexedDB o abrir un archivo de proyecto: lo que no cumple reglas de negocio se conserva con `validationErrors`; lo que no tiene forma va a cuarentena por registro. Nunca se descarta un proyecto entero.
- Toda transformación o descarte produce un `Issue` o `Warning` visible. Los mensajes al usuario van en español.

### VI. Seguridad por defecto
- Todo Route Handler se declara con `withApiGuards` (host → auth → Content-Type y origen → rate limit → concurrencia → tamaño); las páginas se autentican en `src/proxy.ts`. Las únicas excepciones son el redirect de III, `GET /api/health` y `GET /api/storage/**` (este último solo con storage local).
- Con `AUTH_MODE=none` el servidor **no arranca** en producción. Los secretos nunca se versionan (`.env*`, salvo `.env.example`); admiten la variante `*_FILE`.
- Toda descarga externa pasa por `safeFetch` (https, IP públicas, tamaños y tiempos acotados); todo SVG externo se sanea con lista blanca y se rechaza, no se ignora.
- Los QR generados nunca se versionan en git.

### VII. Tests y calidad como contrato
- `bun run test` (Vitest: proyectos `unit`, `dom`, `integration`); **no** `bun test`, que usa el runner de Bun. E2E con Playwright (`bun run test:e2e`).
- TypeScript estricto: sin `any`, sin `as any`, sin `@ts-ignore` (`@ts-expect-error` solo con descripción), sin `alert/confirm`.
- No se borran, saltan ni debilitan tests o umbrales (cobertura ≥ 85 % en lib/server/schemas) para llegar a verde. Un test obsoleto se actualiza al comportamiento nuevo, conservando lo que verifica.
- Un cambio no está terminado hasta que `bun run lint`, `bun run typecheck`, `bun run test` y `bun run build` pasan.

## Restricciones adicionales

**Stack:** Next.js 16 (App Router, `output: standalone`), React 19, TypeScript, MUI + Tailwind v4, Zod 4, `qr` (matriz del QR), pdfkit, fontkit, SheetJS (`xlsx` desde su CDN), zustand + IndexedDB. Bun gestiona dependencias y ejecuta scripts; build y runtime corren en **Node 24**. `bun.lock` es el único lockfile versionado. Añadir una dependencia nueva requiere justificarla en el plan de la feature.

**Estilos:** MUI pinta los componentes solo a través del tema; Tailwind se usa para layout, espaciado y responsive. Sin literales de color en `sx`/`style` dentro de `src/components/**`; los tokens se definen una sola vez (tema MUI → `globals.css`). Referencia visual: `DESIGN.md` y `PRODUCT.md`.

**Fuentes:** Gotham (interfaz) y Address Sans Pro Cd (piezas) tienen licencia comercial: **no se versionan**. `bun run fonts:setup` las instala desde la máquina local y verifica su sha256 contra el `manifest.json` de cada familia; un archivo que no coincide con el manifiesto —o con la huella de anchos de Address Sans Pro **Cd**, que no es lo mismo que «SemiBold» de ancho normal— no debe usarse para producir piezas. Los archivos se guardan en `.woff2`.

**Código heredado:** la rama `qr-api-created` (`app/`, `lib/`, `data/`, `qrcode`, `pdf-lib`, `archiver`, `tailwind.config.js`) fue absorbida y reemplazada por `src/`; no se reintroduce.

## Flujo de trabajo

- **Spec primero:** toda feature nueva pasa por Spec Kit (`/speckit-specify` → `clarify` → `plan` → `tasks` → `implement`, con `analyze` antes de implementar). Las features existentes están documentadas en [`specs/`](../../specs/) (`001`–`008`, más las anteriores F001–F004) y las fases del proyecto en `docs/ARCHITECTURE.md` §G.
- **Commits** en español, con prefijo convencional (`feat:`, `fix:`, `docs:`, `chore:`, `merge:`), uno por cambio coherente. Las ramas largas se integran con `merge`, nunca descartando trabajo del otro lado sin dejarlo dicho en el mensaje.
- Los cambios en la regla del QR (II), el link estable (III) o el pipeline vectorial (IV) se revisan contra esta constitución antes de fusionarse.

## Governance

Esta constitución prevalece sobre otras prácticas del repositorio; `docs/ARCHITECTURE.md` detalla el *cómo*. Una enmienda se propone con `/speckit-constitution`, indica qué principio cambia y por qué, actualiza esta versión y migra los documentos afectados en el mismo cambio. Toda revisión debe verificar el cumplimiento de los principios I–VII; la complejidad añadida se justifica en el plan de la feature. Guía de ejecución para agentes: `AGENTS.md` y `CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-09 | **Last Amended**: 2026-10-09
