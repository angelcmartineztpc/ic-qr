# Tasks: Rediseño UX/UI Unificado y Despliegue Persistente en Cloudflare Workers

**Input**: Documentación de diseño y despliegue de `013-rediseno-ux-ui-y-despliegue-cloudflare`
**Prerequisites**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 1: Sistema de Diseño, Tokens y Marco Global

- [x] T001 Definir tokens semánticos en `src/app/globals.css` y `src/app/_providers/theme.ts` con color primario `#274C69` y modo oscuro tonal (`#0a0e12`, `#121920`, `#1b242e`, `#6B9BC3`)
- [x] T002 Compactar `src/components/layout/AppShell.tsx`, `src/components/layout/WizardSteps.tsx`, `src/components/ui/StepHeader.tsx` y `src/components/ui/StepFooter.tsx`, unificando el estado de guardado en `ProjectBadge`

## Phase 2: Componentes Globales (Toasts y Modales)

- [x] T003 Transformar el banner de proyecto restaurado en un Toast flotante con autocierre en `src/components/layout/PersistenceBanners.tsx`
- [x] T004 Estandarizar `src/components/ui/ModalLayout.tsx` y `src/components/ui/ConfirmDialog.tsx` (`Cancelar` a la izquierda, CTA primario a la derecha, trampa de foco y cierre con `Escape`)

## Phase 3: Rediseño del Editor (`/editor`)

- [x] T005 Reestructurar `src/components/records/BuilderToolbar.tsx`, `src/components/records/EditorScreen.tsx` y `src/components/records/RecordCounters.tsx` en 2 niveles limpios con filtros tipo píldora M3 Expressive
- [x] T006 Simplificar `src/components/records/RecordDetail.tsx`, `src/components/records/RecordQrActions.tsx` y `src/components/records/RecordCard.tsx` (`Editar` como único botón primario y acciones secundarias como iconos `36×36px` / `44×44px` con `Tooltip`)

## Phase 4: Accesibilidad WCAG AA y Pantallas Restantes

- [x] T007 Aplicar tokens unificados, objetivos táctiles y contraste WCAG AA en `src/components/records/DashboardPanel.tsx`, `src/components/ui/EmptyState.tsx`, `src/components/qr-style/QrStyleScreen.tsx`, `src/components/qr-style/ShapePicker.tsx`, `src/components/editor/PreviewScreen.tsx`, `src/components/editor/ExportScreen.tsx` y `src/components/links/LinkDestination.tsx`

## Phase 5: Despliegue Persistente en Cloudflare Workers (`QR_KV` + Fuentes Embebidas)

- [x] T008 Crear `scripts/embed-server-fonts.mjs` y actualizar `src/server/fonts/index.ts` para cargar `AddressSansPro-CdSemibold.woff2` en memoria en Cloudflare Workers
- [x] T009 Crear namespace de Cloudflare KV (`QR_KV`), enlazarlo en `wrangler.jsonc` y conectar el adaptador KV en `src/server/storage/r2.ts` para persistir links dinámicos (`/s/{código}`) y QR SVGs (`qr/v1/*.svg`)
- [x] T010 Actualizar `specs/README.md`, `specs/009-cloudflare-workers/spec.md` y `CHANGELOG.md`
- [x] T011 Rediseñar flujo «Empezar de nuevo / Nuevo proyecto» con `src/components/records/StartOverDialog.tsx`, botón visible `+ Nuevo proyecto` / `Empezar de cero` en `DashboardPanel.tsx` y acción explícita en `BuilderToolbar.tsx`

