# F001 — Properties data + buildServiceUrl

**Status:** Implemented (modelo simplificado) · **Owner:** Angel C. Martinez · **Scope:** data/lógica, sin UI

## Decisión
El QR depende de resort + servicio, no del spot (QR decodificado de la etiqueta real: `https://pool-service.palaceresorts.com/restaurant/TGPC`). Sin colores, logo ni zonas.

## Deliverable
`data/properties.ts` + `data/properties.test.ts`.

```ts
export type Service = "pool" | "restaurant";
export type SpotType = "mesa" | "camastro";
export interface Property { id: string; name: string; resortCode: string; serviceUrls: Record<Service, string> }
```
- `serviceUrls[s]` = URL de destino completa (ver F004).
- `properties: Property[]` — `cancun`, `riviera`, `grand-punta-cana` ("Grand Punta Cana", TGPC).
- `getProperty(id)` → `Property` o `PropertyError`.
- `buildServiceUrl(property, service)` → URL estable del redirect (ver F004).

## Acceptance criteria
- [x] TS strict, sin `any`.
- [x] `buildServiceUrl(cancun, "restaurant")` = `.../restaurant/TGCU`.
- [x] `buildServiceUrl(tgpc, "pool")` = `.../pool-area/TGPC`; `restaurant` = `.../restaurant/TGPC`.
- [x] `PropertyError` tipado para id/servicio desconocido.
- [x] `bun test` cubre restaurant, pool, TGPC (ambas URLs), property inexistente.

## Open questions
1. `resortCode` de `riviera` (`TGPR`) y son placeholders; confirmado: `TGPC` con `/pool-area` y `/restaurant` (la base `pool-area` se aplica a todos).
2. Faltan 8 resorts (incluye TGCU): no hay lista en la conversación; hoy solo existen `cancun`, `riviera`, `grand-punta-cana`.
