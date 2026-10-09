# F003 — Plan

Spec: `specs/F003-label-export.md`. Deps instaladas: `archiver`, `fontkit` (+ `@types`). Route handler: `POST(request: NextRequest)` (Next 16.3.8, `await request.json()`).

## Decisiones técnicas
- **Texto → trazado:** `fontkit.openSync(public/fonts/Gotham-*.woff2)`; `font.layout(str)` → glifos + posiciones; `glyph.path.toSVG()` con transform (escala `size/unitsPerEm`, flip Y, traslación por `xAdvance`). Una función `textPath(str, weight, size)` → `{ d, width }`. Fuentes cacheadas a nivel módulo.
- **QR único trazado:** `QRCode.create(url)` → `modules.data`/`size`; un `<path>` con un `M x y h1 v1 h-1 z` por módulo oscuro (runs horizontales unidos). Fondo `<rect fill="#fff">`; quiet zone = 4 módulos en el cálculo del tamaño.
- **Layout:** viewBox cuadrado fijo (p. ej. 1000×1000 unidades); `width`/`height` en mm desde `widthMm` (default 100). Bloques centrados: estación → tipo → número → 2 líneas bilingües → QR.
- **ZIP:** `archiver("zip")` → buffer en memoria (máx. 500 SVG) → `new Response(buffer, { headers: application/zip, Content-Disposition })`.
- **Errores:** `LabelError`, `ExportError { code }` (`INVALID_INPUT | PROPERTY_NOT_FOUND | LIMIT_EXCEEDED | INTERNAL`) → mapeo a status en el route.
- **Reuso:** `getProperty`/`buildServiceUrl` (F1); no se llama al endpoint de F2, se usa `qrcode` directo (necesita módulos, no SVG).
- Sin dependencias adicionales.

## Archivos
| Archivo | Contenido |
|---|---|
| `lib/label.ts` | `LabelError`, `textPath`, `qrPath`, `generateLabel` |
| `app/api/export/route.ts` | validación body, límite 500, ZIP |
| `lib/label.test.ts` | SVG: sin `<text>`/fuentes, un solo `<path>` de QR, determinista, QR decodifica a la URL |
| `app/api/export/route.test.ts` | ZIP/orden de nombres, 500 OK / 501 error, 404, 400 |

## Pasos
1. `textPath` + prueba rápida de ancho.
2. `qrPath` (módulos → un `d`).
3. `generateLabel` (layout, texto bilingüe por `service`, parámetro `widthMm`).
4. Route: validar → `getProperty` → URL → generar N SVG → ZIP.
5. Tests; `bun test`, `bunx tsc --noEmit`, `bun run build`.

## Riesgos
- Gotham condensada ausente (open question 1): escala horizontal es aproximación visual.
- Tests de decodificación del QR: sin lector instalado → verificar comparando `modules` regenerados desde la URL (sin dependencia nueva).
- Generar 500 SVG con fontkit: cache de fuentes + sin I/O por spot; medir tiempo en tests.
- Textos placeholder (pool) bloquean aceptación final de arte, no la implementación.
