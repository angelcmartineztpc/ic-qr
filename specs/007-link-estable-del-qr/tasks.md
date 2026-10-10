# Tasks: Link estable del QR por resort y servicio

**Input**: [spec.md](spec.md), [plan.md](plan.md), [contracts/qr-redirect.md](contracts/qr-redirect.md)

**Estado**: retrospectiva; `[x]` solo donde el archivo existe y hay test o commit que lo respalda. Todas las rutas son relativas a la raíz del repositorio.

## Fase 1: Datos de resorts (base de las dos historias)

- [x] T001 Definir `Property`, `Service`, `SERVICES` y `SERVICE_LABELS` en `src/lib/resorts/properties.ts`
- [x] T002 Declarar los 9 resorts con destinos `pool` y `restaurant` (`BASE` + `/pool-area/{código}` o `/restaurant/{código}`) en `src/lib/resorts/properties.ts`
- [x] T003 [P] Implementar `findPropertyByCode` e `isService` en `src/lib/resorts/properties.ts`
- [x] T004 [P] Implementar `buildServiceUrl(property, service, domain)` sin barra doble en `src/lib/resorts/properties.ts`
- [x] T005 Tests de la lista (9 resorts, códigos únicos, TGPC, URL estable, desconocidos) en `src/lib/resorts/properties.test.ts`

## Fase 2: Historia 1 — Redirección (P1)

- [x] T006 [US1] `GET` con 302 + `Location` + `Cache-Control: no-store` en `src/app/api/qr/[resortCode]/[service]/route.ts`
- [x] T007 [US1] Respuesta 404 JSON `{ error }` con `no-store` para resort o servicio desconocido en el mismo archivo
- [x] T008 [US1] Tests 302/404 en `src/app/api/qr/[resortCode]/[service]/route.test.ts`
- [x] T009 [US1] Dejar la ruta fuera de `withApiGuards` y confirmar que `src/proxy.ts` excluye `api/` en su `matcher` (verificado leyendo el código; sin test automático)

## Fase 3: Historia 2 — Selector en formulario e importación (P1)

- [x] T010 [US2] Crear `ResortLinkPicker` (campos «Resort» y «Servicio», dominio de `NEXT_PUBLIC_QR_DOMAIN` o `window.location.origin`) en `src/components/forms/ResortLinkPicker.tsx`
- [x] T011 [US2] Integrarlo en el formulario de pieza: `onPick` actualiza `menuUrl` en `src/components/forms/RecordForm.tsx`
- [x] T012 [US2] Integrarlo en la importación: `onPick={setDefaultMenu}` y texto de ayuda del link común en `src/components/import/ImportScreen.tsx`
- [ ] T013 [US2] Test de componente de `ResortLinkPicker` (con y sin `NEXT_PUBLIC_QR_DOMAIN`; no se rellena hasta tener resort y servicio): no existe

## Fase 4: Historia 3 — Cambio de destino sin reimprimir (P2)

- [x] T014 [US3] Mantener destinos solo en `src/lib/resorts/properties.ts` (el QR codifica únicamente la ruta estable)
- [ ] T015 [US3] Decidir si los destinos pasan a base de datos para evitar el deploy (pregunta abierta de F004; sin trabajo iniciado)

## Fase 5: Configuración y documentación

- [x] T016 [P] Declarar `NEXT_PUBLIC_QR_DOMAIN` en `.env.example` (sección «Link estable del QR»)
- [x] T017 [P] Documentar en `README.md` la sección «Link estable del QR»
- [x] T018 [P] Registrar el origen y las diferencias en `specs/README.md` (F001–F004)
- [ ] T019 Añadir la ruta a la lista de endpoints y exenciones de `docs/ARCHITECTURE.md` §A.5 (hoy enumera siete y no la incluye)
- [ ] T020 Fijar el dominio definitivo de `NEXT_PUBLIC_QR_DOMAIN` y coordinar el enrutamiento de `/api/qr/*` con las rutas de Palace (decisión fuera del código)

## Dependencias

- T001–T004 preceden a T006, T010 y T011.
- T006 y T007 comparten archivo; T008 depende de ambos.
- T010 precede a T011 y T012 (en paralelo entre sí).

## Evidencia

- Comandos: `bun run test` (917 tests pasan según el cierre de la integración); archivos específicos: `bunx vitest run src/lib/resorts src/app/api/qr` (no ejecutado en esta documentación).
- Commits (`git log --oneline`):
  - `6da1e64` feat: link estable del QR por resort y servicio (ruta, lista, selector, `.env.example`)
  - `87f279d` merge: integrar qr-api-created en integracion-front-back
  - `e5bb60d` docs: constitución de Spec Kit, README y mapa de specs tras la integración
  - `57d20a1` fix: tests de «Descargar SVG» al menú de la tarjeta y lint sin carpetas de skills
