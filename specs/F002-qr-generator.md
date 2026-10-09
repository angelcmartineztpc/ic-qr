# F002 — QR Generator + GET /api/qr

**Status:** Draft · **Owner:** Angel C. Martinez · **Scope:** lógica + API, sin UI · **Depende de:** F001

## Deliverables
- `lib/qr-generator.ts`
- `app/api/qr/route.ts`
- `lib/qr-generator.test.ts`

## API lib
`generateQR(url: string): Promise<string>` → SVG string, vía `QRCode.toString(url, { type: "svg" })` del paquete `qrcode` (ya instalado, con `@types/qrcode`). Sin servicios externos.

- `url` vacío o no parseable con `new URL()` → `throw Error` tipado.
- Función sin I/O adicional.

## Endpoint
`GET /api/qr?url=<encoded-url>`

| Caso | Respuesta |
|---|---|
| OK | 200, body SVG, `Content-Type: image/svg+xml` |
| `url` ausente/ inválida | 400, JSON `{ error: string }` |
| Fallo interno | 500, JSON `{ error: string }` |

## Acceptance criteria
- [ ] TS strict, sin `any`.
- [ ] `generateQR` devuelve string que empieza con `<svg`.
- [ ] Misma entrada → misma salida (determinista).
- [ ] GET válido → 200 + `image/svg+xml`; sin `url` → 400.
- [ ] `bun test` cubre: SVG válido, url vacía, url inválida.

## Open questions
1. ¿Restringir `url` a los `baseUrl` de `properties` (evita usar el endpoint como generador abierto) o aceptar cualquier URL? Supuesto: cualquier `http(s)`.
2. ¿Opciones de color/margen/nivel de corrección en F2 o después (F3+, con `brandColor`)? Supuesto: defaults de `qrcode`, sin opciones.
3. ¿Cache headers (`Cache-Control: public, max-age=...`)? Supuesto: no.
4. El endpoint no estaba en una spec previa; esta spec lo aprueba (regla "ask first" de CONSTITUTION).
