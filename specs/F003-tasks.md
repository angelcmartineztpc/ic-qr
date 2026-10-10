# F003 — Tasks

Plan: `specs/F003-plan.md`

- [x] **T1** `lib/label.ts`: `LabelError` + `textPath(str, weight, size)` con fontkit (fuentes cacheadas) → `{ d, width }`.
- [x] **T2** `lib/label.ts`: `qrPath(url)` → un solo `d` desde `QRCode.create` (runs horizontales, quiet zone 4 módulos). *(dep: —, paralelo a T1)*
- [x] **T3** `lib/label.ts`: `generateLabel({ stationName, spotType, number, service, url, widthMm? })` — layout de la referencia, texto bilingüe por `service`. *(dep: T1, T2)*
- [x] **T4** `lib/label.test.ts`: sin `<text>`/`font-family`; un solo `<path>` de QR; determinista; módulos del QR = los de la URL; `widthMm` aplica. *(dep: T3)*
- [x] **T5** `app/api/export/route.ts`: `ExportError { code }`; validar body (service `pool|restaurant`); `getProperty` → `buildServiceUrl`; límite 500; ZIP con `archiver`, nombres con padding. *(dep: T3)*
- [x] **T6** `app/api/export/route.test.ts`: ZIP con N archivos y orden; 500 OK / 501 `LIMIT_EXCEEDED`; 404; 400 (`start > end`, service inválido, campos faltantes). *(dep: T5)*
- [x] **T7** Verificar: `bun test`, `bunx tsc --noEmit`, `bun run build`. *(dep: T1–T6)*

Orden: (T1 ∥ T2) → T3 → T4 → T5 → T6 → T7.
