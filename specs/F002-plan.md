# F002 — Plan

Spec: `specs/F002-qr-generator.md`. Docs verificados: Next 16.3.8 route handlers (`GET(request: NextRequest)`, `request.nextUrl.searchParams`).

## Decisiones
- `qrcode` ya instalado → sin dependencias nuevas.
- Supuestos de la spec se mantienen (cualquier `http(s)`, sin opciones, sin cache headers).
- Error tipado: `class QRError extends Error` en `lib/qr-generator.ts` (única clase; el route mapea `QRError` → 400, cualquier otro → 500).
- Validación de URL: `new URL(url)` + protocolo `http:`/`https:`.
- Tests con `bun test`, importando `GET` directo (sin servidor).

## Archivos
| Archivo | Contenido |
|---|---|
| `lib/qr-generator.ts` | `QRError`, `generateQR(url): Promise<string>` |
| `app/api/qr/route.ts` | `GET(request: NextRequest)`: lee `?url`, llama `generateQR`, responde SVG o JSON de error |
| `lib/qr-generator.test.ts` | casos de la spec |

## Pasos
1. `generateQR`: validar → `QRCode.toString(url, { type: "svg" })`.
2. `GET`: `url = request.nextUrl.searchParams.get("url")`; 200 `image/svg+xml` / 400 / 500 con `{ error }`.
3. Tests: SVG empieza con `<svg`; determinista; url vacía y inválida → `QRError`; `GET` 200 + content-type; `GET` sin `url` → 400.
4. Verificar: `bun test`, `bunx tsc --noEmit`, `bun run build`.

## Riesgos
- Endpoint abierto a cualquier URL (open question 1 de la spec); mitigable luego restringiendo a `baseUrl` de `properties`.
