# Feature Specification: Módulo PULSE «QR Producción»

**Feature Branch**: `mejoras-ux`

**Created**: 2026-10-16 (retrospectiva: la migración se empezó antes de esta spec; ver «Proceso»)

**Status**: In progress — módulo y backend implementados y validados contra Supabase **local**; falta validar en un Supabase remoto, la integración en el repositorio real de PULSE y la guía de despliegue.

**Input**: Petición del usuario: migrar la herramienta a lo que pide la «Guía de Integración — Nuevo Módulo para PULSE» (Vite + React 19 + react-router 6 + CSS Modules + Supabase, módulo autocontenido con ruta propia) para que el administrador de PULSE lo fusione. Decisiones tomadas con el usuario (2026-10-15/16): (1) el servidor Node pasa a **Supabase Edge Functions** + Storage + Postgres; (2) el módulo se construye en la carpeta **`pulse/`** de este repositorio, con la estructura de la guía; (3) la UI se reescribe en **CSS Modules** (sin MUI/Emotion/Tailwind); (4) dependencias aprobadas: `qr`, `fflate`, `zustand`, `zundo`, `idb-keyval`, `@dnd-kit/*`, `@tanstack/react-virtual`, `@xmldom/xmldom`, `pdf-lib`; (5) un solo PDF al exportar por lotes, unido en el **cliente** con `pdf-lib`; (6) el dominio de los QR se fija antes de imprimir; (7) el rol «QR Producción» va en un PR aparte en el repositorio de PULSE.

## Problema

La herramienta actual (Next.js + MUI + servidor Node) no se puede fusionar a PULSE: PULSE es Vite + CSS Modules + Supabase, con sus roles, su tema (Dark/Light/Sepia) y su despliegue. Una migración «por partes y sin comprobar» arriesga lo más caro de este producto: **los QR se graban en metal y no se reimprimen**. La migración debe conservar las garantías de la constitución (II, III, IV) y demostrar con un entorno real —no solo con simulacros— que el SQL, la RLS y las funciones se comportan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - La persona usa el flujo completo dentro de PULSE (Priority: P1)
Con el rol «QR Producción» o Admin, en `/qr-produccion` crea o importa piezas, ajusta el estilo del QR y el diseño, y descarga el PDF y/o el ZIP de SVG, igual que hoy.

**Acceptance**: las cinco pantallas (Piezas, Importar, Estilo, Diseño, Exportar) conservan textos, `data-testid` y comportamiento (1072 pruebas verdes en `pulse/`).

### User Story 2 - El proyecto se guarda en la base antes que en pantalla (Priority: P1)
Cada cambio se guarda en `qr_proyectos` (DB-first) con control de revisión; IndexedDB queda como caché. Si otro dispositivo guardó antes, no se pisa: se ofrece «Conservar lo mío» o «Usar lo guardado». Sin conexión se sigue en local y al volver la red se sube solo.

**Acceptance**: pruebas de `StoreProvider` (hidratación, conflicto, caída de red a mitad de sesión) y 11 pruebas de RLS/trigger/adaptador contra Supabase local real.

### User Story 3 - Exportar muchas piezas da un solo PDF (Priority: P1)
Una Edge Function tiene un techo de CPU, así que el cliente parte la exportación en lotes (≤ 100, múltiplos de la hoja) y los une en **un PDF** con `pdf-lib`, sin hojas a medias entre lotes; los SVG van en un ZIP con numeración global. Si la unión falla se entrega el ZIP de PDF por lote con un aviso.

**Acceptance**: pruebas de `batch.ts` con PDF reales (cajas TrimBox/BleedBox conservadas) y 120 piezas contra la función real = las mismas hojas que sin lotes.

### User Story 4 - Quien administra PULSE puede revisarlo, desplegarlo y fusionarlo (Priority: P2)
Recibe el módulo con una lista de lo que debe cambiar en PULSE, la migración SQL, las funciones y los pasos de despliegue comprensibles para quien no es especialista.

**Acceptance**: `pulse/PULSE_INTEGRATION.md` (hecho) y `pulse/DESPLIEGUE.md` (pendiente, T-043).

### Edge Cases
- **Conflicto de revisión:** no se sobrescribe nada; la persona decide.
- **Sin sesión, sin rol o con rol distinto:** 401/403 en las funciones; la RLS no deja ver ni crear.
- **QR externo cuya lectura depende de remates redondos:** sale `undecodable` y la persona decide (límite conocido, ver plan).
- **Redirects públicos** (`/s/{código}`, `/api/qr/…`): sin sesión, 302, `no-store`.

## Requirements *(mandatory)*

- **FR-001** El módulo vive en `pulse/` con la estructura de la guía (`pages/`, `components/`, `services/`, `types/index.ts`, `supabase/`, SQL en la raíz) y no importa nada de `src/` del resto del repo.
- **FR-002** Sin MUI, Emotion, Tailwind, Next ni `console.log` en `pulse/`; colores solo con variables de tema (salvo datos del dominio).
- **FR-003** DB-first: se persiste en Supabase antes de actualizar el estado local.
- **FR-004** La regla crítica del QR (II) y el link estable (III) se conservan: un registro con «Link del QR» nunca genera uno nuevo; el QR codifica `/s/{código}` o `/api/qr/{resort}/{servicio}`.
- **FR-005** RLS por propietario o rol (`Admin`, `QR Producción`); sin `USING (true)`; las tablas de catálogo y enlaces solo las escriben las funciones con service role.
- **FR-006** Las 7 Edge Functions se despliegan empaquetadas (un archivo por función) y se prueban contra Supabase local (`bun run test:db`).
- **FR-007** Un solo PDF al exportar, sea cual sea el número de piezas, salvo «un PDF por Estación».
- **FR-008** El dominio de los QR es una variable explícita (`VITE_QR_DOMAIN` y `QR_PUBLIC_BASE`) y documentada como permanente.
- **FR-009** Todo lo que no se pudo verificar queda dicho (README de `supabase/`, TODO en el código, tareas abiertas).

## Success Criteria
- `tsc --noEmit` limpio, `vitest run` verde (1072), `vite build` correcto y `bun run test:db` verde (23) en `pulse/`.
- Historial Git sin archivos accidentales (T-050).
- Las tareas abiertas de `tasks.md` están nombradas y no se dan por hechas.

## Proceso (honesto)
La migración se ejecutó **antes** de existir esta spec, lo que incumple «spec primero» (constitución, «Flujo de trabajo»). Esta spec es **retrospectiva** (como 001–008): las tareas hechas citan su commit y no se reescribe la historia. Detectado al comprobar que no existía spec ni `tasks.md`.

## Pendientes
Ver [`tasks.md`](tasks.md): validar en Supabase remoto (CPU real, RLS con los roles de PULSE), `deno` local sobre las funciones, `DESPLIEGUE.md`, ESLint de `pulse/`, prueba manual en navegador y con teléfono, PR del rol en PULSE.
