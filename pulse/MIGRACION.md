# Migración de ic-qr → módulo PULSE «QR Producción»

Origen: app Next.js 16 + MUI + Tailwind + servidor Node (raíz del repo, `src/`).
Destino: módulo de PULSE según `guia_integracion_nuevo_modulo_pulse` (Vite + React 19 + react-router 6 + Supabase + CSS Modules).
Esta carpeta `pulse/` es un **arnés Vite**; lo que se fusiona a PULSE es `src/` (menos los stubs marcados «ARNÉS») y `supabase/` + `patch-qr-produccion.sql`.

## Decisiones tomadas (con el usuario)
1. **Backend → Supabase Edge Functions (Deno)** + Storage + tablas Postgres. Sin servidor Node.
2. **Destino → carpeta `pulse/` en este repo**, con la estructura de la guía.
3. **UI → CSS Modules**, sin MUI/Emotion/Tailwind. Iconos `lucide-react`. Toasts `sonner`.

## Mapa de carpetas
| Origen (`src/`) | Destino (`pulse/src/`) |
|---|---|
| `lib/**`, `schemas/**`, `templates/**` | `services/qr-produccion/**` (ya movido, 474 pruebas pasan) |
| `types/*.ts` | `types/index.ts` (archivo único, ya fusionado) |
| `app/*/page.tsx` | `pages/qr-produccion/*.tsx` (`export default`, rutas lazy en `App.tsx`) |
| `components/**` | `components/qr-produccion/**` (CSS Modules por componente) |
| `server/**`, `app/api/**` | `../supabase/functions/**` (Deno) |
| ruta `/s/[code]`, `/api/qr/{resort}/{servicio}` | funciones `qr-enlaces` y `qr-estable` |
| `lib/state` (IndexedDB) | se mantiene como caché local; la fuente de verdad pasa a Supabase (DB-first) |

Alias `@/` → `src/`. Imports de lógica: `@/services/qr-produccion/...`. Tipos: `@/types`.

## Reglas (de la guía)
- `export default` en páginas; sin `console.log` (solo `error`/`warn`); sin `any`; sin colores hardcodeados (variables `--bg-card`, `--text-primary`, `--border-subtle`, `--primary`, `--status-*`, `--space-*`, `--radius-*`); funcionar en Dark/Light/Sepia.
- DB-first: persistir en Supabase **antes** de actualizar estado local; guard anti doble clic en acciones.
- `noUnusedLocals/Parameters`: `bunx tsc --noEmit` debe quedar limpio.
- Textos en español con `t('qrProduccion.x', 'Texto')` (react-i18next) donde sea razonable; en el arnés `t` es un stub.

## Dependencias que requieren autorización de PULSE (la guía prohíbe nuevas sin consultar)
`qr` (generador vectorial), `fflate` (ZIP), `zustand` + `zundo` (estado y deshacer), `idb-keyval` (caché local), `@dnd-kit/*` (reordenar piezas), `@tanstack/react-virtual`, `@xmldom/xmldom` (saneado SVG). Ya presentes en PULSE: react, router, supabase-js, zod, lucide-react, sonner, react-query.
Backend (Deno, vía `npm:`): `pdfkit`, `fontkit`, `xlsx` (SheetJS), `fflate`.

## Limitaciones conocidas (no resolverlas en silencio)
- `sharp` no existe en Edge Functions: verificación por decodificación de QR externos y normalización del logo requieren alternativa (WASM o en el cliente).
- Límites de Edge Functions (CPU/memoria) pueden no alcanzar para 1000+ piezas en un PDF: ver `supabase/README.md`.
- No hay Deno ni Supabase CLI en esta máquina: las funciones se escriben y se tipan por revisión, **no se ejecutaron**.
- Tipografías (Gotham/Address Sans) tienen licencia comercial: se suben a un bucket privado, no se versionan.
