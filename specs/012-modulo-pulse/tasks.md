# Tareas: Módulo PULSE «QR Producción»

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Marcar `[x]` solo con la verificación indicada y el commit que la contiene. Las `[ ]` son trabajo pendiente real o verificaciones sin hacer. Todas las rutas son relativas a `pulse/` salvo que se indique.

## Fase A · Estructura, lógica y UI (hecha)
- [x] **T-001** Arnés Vite y estructura de la guía (`pages/`, `components/`, `services/`, `types/index.ts`, alias `@/`). Commit `0c744d0`. Verificación: `tsc --noEmit`, `vite build`.
- [x] **T-002** Lógica pura (QR, documento, Excel, esquemas, registros, estado) movida a `src/services/qr-produccion/**` y tipos fusionados en `src/types/index.ts`. Commit `0c744d0`. Verificación: las 474 pruebas originales siguen verdes.
- [x] **T-003** Kit de UI en CSS Modules (`components/qr-produccion/ui/`) y las cinco pantallas migradas sin MUI/Emotion/Tailwind/Next/`console.log`. Commit `0c744d0`. Verificación: `grep` sin coincidencias; pruebas DOM verdes. Colores literales solo en datos del dominio (lámina blanca de la pieza, negro por defecto del logo, valor inicial del selector).

## Fase B · Backend en Supabase
- [x] **T-010** SQL: 5 tablas, RLS por propietario o rol, buckets privados `qr-produccion` y `qr-fuentes`, siembra de resorts (`patch-qr-produccion.sql` = migración). Commit `0c744d0`; validado en `253e03a`.
- [x] **T-011** Siete Edge Functions escritas (`supabase/functions/*`). Commit `0c744d0`.
- [x] **T-012** *Resolver sloppy-imports vs `bun build`:* empaquetado con Bun (`supabase/build-functions.ts`); el CLI no resolvía imports sin extensión y el runtime no aplicó el `import_map`. Commit `7213006`. Verificación: las 7 funciones arrancan y responden.
- [x] **T-013** *Validar SQL/RLS contra Supabase local:* migración aplicada limpia; 11 pruebas con tres usuarios (sin rol, «QR Producción», Admin). Commit `253e03a`. Verificación: `bun run test:db` (`supabase/tests/db.integration.test.ts`); los rechazos son de RLS (comprobado a mano).
- [x] **T-014** *Validar las 7 Edge Functions:* se ejecutan en el **runtime de Edge de Supabase local** (contenedor `supabase-edge-runtime-1.77.4`, compatible con Deno 2.1.4) y se invocan por HTTP desde pruebas que corren en Bun/Vitest. Commits `7213006`, `c75eacd`, `10167d8`. Verificación: `supabase/tests/functions.integration.test.ts` (12 pruebas: 401/403, acortador + 302, generar/servir/reutilizar QR, SSRF, logo, estable 404, importar `.xlsx`, vista previa, exportar).
- [x] **T-015** *Probar `npm:pdfkit` + `npm:fontkit` con woff2 en Deno:* PDF vectorial y ZIP válidos desde la función real, con la fuente Address Sans en `qr-fuentes`. Commit `7213006`. Verificación: prueba «3 piezas» y «100 piezas en una llamada» (≈ 0,7–1,5 s en local).
- [ ] **T-016** *(C bis)* Ejecutar las funciones con **Deno local** (`deno` 2.9.7 instalado, nunca invocado): `deno check` sobre cada `index.ts` empaquetado y `deno test` de lo que corresponda. El runtime de Supabase local **no** equivale a `deno test`: esta tarea sigue abierta.
- [x] **T-017** `qr_roles_del_usuario()`: variantes `user_roles` y `profiles.roles` probadas en local; TODO en el cuerpo y `COMMENT ON FUNCTION` (sin `RAISE NOTICE`: se evalúa por fila en RLS). Commit `a871012`. Verificación: `\df+` muestra el TODO; `db reset` + `test:db` verdes.
- [ ] **T-018** *Ajustar `qr_roles_del_usuario()` al esquema real de PULSE.* Bloqueada: no hay acceso al repositorio de PULSE. Ver `PULSE_INTEGRATION.md` §5.
- [ ] **T-019** Medir CPU/memoria de `qr-exportar` en un **Supabase remoto**: el runtime local no aplica el límite de producción, así que el tope de 100 piezas no está confirmado allí.
- [ ] **T-020** `supabase functions deploy` con el entrypoint empaquetado contra un proyecto remoto (nunca probado).

## Fase C · Persistencia y exportación
- [x] **T-021** Persistencia remota DB-first cableada en `StoreProvider` (la base manda; caché local más nueva se sube; conflicto sin pisar). Commit `514c547`. Verificación: `StoreProvider.remote.test.tsx`.
- [x] **T-022** Pruebas del aviso de conflicto («Conservar lo mío» / «Usar lo guardado») y de la caída de red **a mitad de sesión**; corrige un fallo real (agotados los reintentos, no se subía al volver la red: ahora el evento `online` hace flush). Commit `45c90ff`. Verificación: `PersistenceBanners.remote.test.tsx`, `StoreProvider.remote.test.tsx`.
- [x] **T-023** TODO visible en `supabaseProjectTable`; validado en Supabase **local** (`253e03a`) y TODO actualizado (`a871012`). Verificación: `db.integration.test.ts` (conflicto real entre dos dispositivos, 23505, UPDATE sin coincidencia = null).
- [ ] **T-024** Validar `supabaseProjectTable` en un **Supabase remoto** con los roles reales de PULSE; solo entonces se quita el TODO.
- [x] **T-025** Unión de PDF en el **cliente** con `pdf-lib` (`export/merge-pdf.ts`); lotes múltiplos de la hoja; fallback a ZIP con aviso `PDF_MERGE_FAILED`. Commit `10167d8`. Verificación: `batch.test.ts` (PDF reales, cajas TrimBox/BleedBox) y 120 piezas contra la función real.
- [ ] **T-026** «Un PDF por Estación» con lotes: una Estación que cruce el límite entre dos lotes queda partida en dos archivos. Defecto previo; decidir cómo repartir los lotes.
- [ ] **T-027** Unión de PDF en una Edge Function: **solo si el negocio lo exige**, y únicamente con Supabase local + `deno test` verdes (T-016). Hoy no se hace.

## Fase D · Entorno y límites
- [x] **T-030** `QR_PUBLIC_BASE` (`supabase/.env.example`) y `VITE_QR_DOMAIN` (`.env.example`) documentados como permanentes; `pdf-lib` añadido a `package.json`. Commit `03d4217`.
- [ ] **T-031** Fijar el **valor definitivo** del dominio de los QR en producción (sin él no se imprime nada).
- [x] **T-032a** Tres pruebas con URLs de `/api/*` actualizadas a Edge Functions con igualdad exacta sobre `functionUrl(...)`. Commit `65b947f`.
- [x] **T-033** Límite de remates de trazo (`stroke-linecap`) documentado y probado: remates rectos se decodifican; redondos/cuadrados quedan `undecodable`. Commit `c75eacd`.
- [ ] **T-032** Conservar `strokeLinecap` en schema, saneado, `render-scene.ts`, `external.ts` y escritor de PDF, para soportar QR externos de trazos gruesos redondeados.

## Fase E · Integración con PULSE
- [x] **T-040** `PULSE_INTEGRATION.md`: rol «QR Producción» (`UserRole`, `AuthContext`, `HomeRedirect`), rutas, tema, SQL, dependencias, variables y tipos. Commit `253e03a`. Es la spec de T-041.
- [ ] **T-041** PR del rol «QR Producción» (y rutas, menú, dependencias) en el repositorio de PULSE. Bloqueada: sin acceso.
- [ ] **T-042** Mapear a las variables de tema de PULSE las que no vienen en la guía (`--bg-page`, `--bg-elevated`, `--bg-hover`, `--text-secondary`, `--text-disabled`, `--primary-hover`, `--on-primary`, `--overlay`).
- [ ] **T-043** `pulse/DESPLIEGUE.md`: guía paso a paso para el administrador de PULSE (requisitos, `supabase link/login`, SQL, tipografías en el bucket, secretos, `functions deploy`, verificación en 5 pasos, errores conocidos). **Vive en `pulse/`** (es una guía operativa que viaja con el módulo, no una especificación); esta spec solo la rastrea. Lo que no se pueda probar sin proyecto remoto se marca «no probado».
- [ ] **T-044** Reconciliar con la spec 011 Fase B (T-100 a T-103): nombres de tablas (`short_links`/`qr_assets` frente a `qr_enlaces`/`qr_activos`) y redirect (`resolve_short_link()` frente a Edge Function). Decidir si 011 Fase B queda *superseded* por esta spec. No se edita 011 hasta decidirlo.
- [ ] **T-045** ESLint de `pulse/` (la guía exige `lint` sin avisos): el script `lint` existe pero **no hay configuración**; además imponer con `no-restricted-imports` que los componentes no importen `services/**/backend/**` (principio I adaptado).
- [ ] **T-046** Una sola fuente de verdad para resorts y destinos (F001): `src/lib/resorts/properties.ts` y las tablas `qr_resorts`/`qr_destinos_resort`.
- [ ] **T-047** Decidir D6 (plan): ¿el SVG del QR generado se sirve público o con URL firmada / ruta autenticada (011 decisión 5 y T-103)?

## Fase F · Verificación global
- [x] **T-050** Revisión del historial: `git log --stat 0c744d0^..HEAD` y `git ls-files pulse`: 452 archivos, solo `.ts`, `.tsx`, `.css`, `.md`, `.json`, `.sql`, `.toml`, `.html`, `bun.lock` y dos `.env.example`. Sin `.env` reales, `node_modules`, `dist`, imágenes, PDF, fuentes, ZIP ni secretos (`eyJhbGci`, `sb_secret_`, claves privadas). Hecho al crear esta spec.
- [x] **T-051** `tsc --noEmit` limpio, `vitest run` 1072 verdes, `vite build` correcto, `bun run test:db` 23 verdes (tras `db reset`).
- [ ] **T-052** Prueba manual del módulo **en un navegador** (`bun run dev`) contra Supabase local: ninguna pantalla se ha abierto aún visualmente; solo hay pruebas DOM.
- [ ] **T-053** Probar en los tres temas (Dark, Light, Sepia) y en móvil (la guía exige los tres temas).
- [ ] **T-054** Verificación manual en Illustrator del PDF **unido** (ver `docs/ILLUSTRATOR.md` y `specs/PENDIENTES.md`) y lectura del QR con un teléfono real sobre el material.
