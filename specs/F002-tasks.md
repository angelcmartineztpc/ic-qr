# F002 — Tasks

Plan: `specs/F002-plan.md`

- [x] **T1** `lib/qr-generator.ts`: `QRError` + `generateQR(url)` (valida `http(s)` con `new URL`, `QRCode.toString(url, { type: "svg" })`).
- [x] **T2** `lib/qr-generator.test.ts` (unit): SVG empieza con `<svg`; determinista; url vacía → `QRError`; url inválida → `QRError`. *(dep: T1)*
- [x] **T3** `app/api/qr/route.ts`: `GET(request: NextRequest)` → 200 `image/svg+xml` / 400 (`QRError` o `url` ausente) / 500, JSON `{ error }`. *(dep: T1)*
- [x] **T4** Tests de `GET` en el mismo test file: 200 + content-type; sin `url` → 400; url inválida → 400. *(dep: T3)*
- [x] **T5** Verificar: `bun test`, `bunx tsc --noEmit`, `bun run build`. *(dep: T1–T4)*

Orden: T1 → T2 → T3 → T4 → T5. Sin tareas paralelizables relevantes.
