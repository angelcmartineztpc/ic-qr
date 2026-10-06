# F004 — URL estable del QR + redirect

**Status:** Implemented · **Owner:** Angel C. Martinez · **Scope:** lógica + API, sin UI · **Depende de:** F001, F003

## Problem
El QR se graba en láser y no se puede reimprimir barato. Si el link de destino cambia, el QR no debe cambiar.

## Decisión
El QR codifica una URL estable `{QR_DOMAIN}/api/qr/{resortCode}/{service}`; esa ruta redirige (302) al destino guardado en `data/properties.ts`. Cambiar un link = editar `serviceUrls`, sin reimprimir.

## Cambios
- `Property.serviceUrls: Record<Service, string>` (URL completa de destino) reemplaza `services`.
- `buildServiceUrl(property, service)` → URL del redirect (no del destino). Lee `process.env.QR_DOMAIN` (sin slash final); si falta → `Error("QR_DOMAIN is not set")` (el export responde 500 `INTERNAL`).
- Nuevos helpers: `getPropertyByCode`, `isService`.
- `GET app/api/qr/[resortCode]/[service]/route.ts`: 302 + `Location` = destino, `Cache-Control: no-store`; resort o servicio desconocido → 404 `{ error }`.
- `.env.example` con `QR_DOMAIN`.

## Acceptance criteria
- [x] `buildServiceUrl(cancun,"restaurant")` = `{QR_DOMAIN}/api/qr/TGCU/restaurant`.
- [x] GET `/api/qr/TGPC/pool` → 302 a `.../pool-area/TGPC`.
- [x] 404 para resort/servicio desconocido; sin `QR_DOMAIN` lanza error.
- [x] Tests `bun test` (25 pass), `tsc`, `build` OK.

## Open questions
1. **El redirect vive en `/api/qr/...` de esta app:** con `QR_DOMAIN=https://pool-service.palaceresorts.com` (ejemplo dado), esta app debe estar desplegada en ese dominio y no chocar con las rutas actuales (`/restaurant/TGPC`). Si el dominio es el de Palace, hay que coordinar el enrutamiento.
2. El dominio queda **grabado para siempre** en las etiquetas: debe ser permanente.
3. Cambiar un destino requiere deploy (está en código). Migrar a BD si se necesita editar sin deploy.
4. `.env*` está en `.gitignore`: `.env.example` no se versiona salvo que se excluya del ignore.
5. Colisión con `/api/qr?url=` (F2): conviven, pero ese endpoint sigue abierto a cualquier URL.
