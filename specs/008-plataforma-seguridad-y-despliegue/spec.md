# Feature Specification: Plataforma, seguridad y despliegue

**Feature Branch**: `008-plataforma-seguridad-y-despliegue` (retrospectiva: infraestructura transversal desarrollada en `integracion-front-back`; nace en la Fase 2, commit `a8639bc`, y se amplía hasta `3055c2e`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: Documentación retrospectiva de la infraestructura que comparten todas las features: validación de entorno, guardas HTTP, autenticación, cabeceras de seguridad, Docker, herramientas de fuentes, estrategia de testing, lint y flujo Spec Kit. Fuentes: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §S8, §S10, §S11, §S13 y Fase 2 (§G); `README.md`; `assets/fonts/*/README.md`; `.specify/memory/constitution.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arranque seguro o no arranca (Priority: P1)

Quien despliega la herramienta configura variables de entorno. Si la configuración es insegura o incompleta, el proceso no arranca y lista todos los problemas a la vez.

**Why this priority**: es la barrera que impide publicar sin autenticación, sin orígenes permitidos o con storage no portable (constitución, principio VI).

**Independent Test**: `parseEnv` con distintos objetos de entorno (`src/server/config/env-schema.test.ts`) sin levantar Next.

**Acceptance Scenarios**:

1. **Given** `NODE_ENV=production` y `AUTH_MODE=none`, **When** se valida, **Then** falla salvo `ALLOW_UNAUTHENTICATED=true`.
2. **Given** `AUTH_MODE=basic` sin hash SHA-256 de 64 hex, **When** se valida, **Then** falla con el nombre de la variable.
3. **Given** producción sin `APP_ORIGINS` ni `APP_ALLOWED_HOSTS`, **When** se valida, **Then** fallan ambas en el mismo mensaje.
4. **Given** `STORAGE_PROVIDER=local` con base `http:` o `localhost` en producción, **When** se valida, **Then** falla salvo `ALLOW_LOCAL_STORAGE_IN_PROD=true`.
5. **Given** un secreto en `<NOMBRE>_FILE`, **When** se valida, **Then** se lee del archivo y se recorta.

---

### User Story 2 - Toda API pasa por las mismas guardas (Priority: P1)

Cada Route Handler se declara con `withApiGuards`, que aplica en orden Host, autenticación, `Content-Type` y origen, rate limit, concurrencia y tamaño del cuerpo, y convierte los errores en respuestas uniformes.

**Why this priority**: un solo punto de seguridad evita que una ruta nueva olvide una defensa.

**Independent Test**: `src/server/http/guards.test.ts` construye las guardas con configuración inyectada y prueba cada código de estado.

**Acceptance Scenarios**:

1. **Given** un `Host` fuera de `APP_ALLOWED_HOSTS`, **When** llega una petición, **Then** 421 `MISDIRECTED_HOST`.
2. **Given** credenciales ausentes o erróneas, **When** llega la petición, **Then** 401 `UNAUTHORIZED` (con `WWW-Authenticate` en modo `basic`).
3. **Given** `Content-Type: text/plain` en una ruta JSON, **When** llega un POST, **Then** 415; con `Sec-Fetch-Site: cross-site` o `Origin` ajeno, 403 `FORBIDDEN_ORIGIN`.
4. **Given** el semáforo lleno, **When** llega la petición, **Then** 429 `BUSY` sin leer el cuerpo, y se libera al terminar.
5. **Given** `Content-Length` o cuerpo real mayor que el máximo, **When** se lee, **Then** 413 `PAYLOAD_TOO_LARGE`.
6. **Given** un error inesperado en el manejador, **When** ocurre, **Then** 500 `INTERNAL` con `requestId` y sin detalles internos.

---

### User Story 3 - Autenticación configurable (Priority: P1)

Hay tres modos: `none` (desarrollo), `basic` (usuario y SHA-256 de la contraseña) y `proxy` (un proxy delante autentica y envía un secreto compartido). Las páginas se autentican en `src/proxy.ts`; las APIs, en las guardas.

**Why this priority**: sin autenticación la herramienta quedaría abierta a cualquiera con acceso a la red.

**Independent Test**: `authenticate` y `withApiGuards` con `AUTH_MODE=proxy` en `src/server/http/guards.test.ts`; `src/proxy.ts` no tiene test propio (ver Pendientes).

**Acceptance Scenarios**:

1. **Given** `AUTH_MODE=basic`, **When** el usuario y el SHA-256 de la contraseña coinciden, **Then** el principal es `basic:<usuario>`; la comparación es de tiempo constante.
2. **Given** `AUTH_MODE=proxy`, **When** `X-Proxy-Auth` coincide con `PROXY_SHARED_SECRET` (≥32 caracteres), **Then** el principal es `proxy:<X-Forwarded-User>` o `proxy`.
3. **Given** una página sin credenciales, **When** se pide, **Then** 401 en texto plano con `Cache-Control: no-store`.
4. **Given** `/api/*`, `/_next/static/*`, `/_next/image/*`, `favicon.ico` o `robots.txt`, **When** se piden, **Then** `proxy.ts` no interviene (matcher).

---

### User Story 4 - Cabeceras de seguridad y sin fugas (Priority: P2)

Toda respuesta lleva CSP, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy` y `Permissions-Policy`; las APIs añaden `Cross-Origin-Resource-Policy: same-origin` y `no-store`, salvo `/api/storage/`. No hay `X-Powered-By`.

**Why this priority**: mitiga XSS, clickjacking y cacheo de datos privados.

**Independent Test**: el E2E `tests/e2e/smoke.spec.ts` comprueba `frame-ancestors 'none'` en la CSP y la ausencia de `x-powered-by`.

**Acceptance Scenarios**:

1. **Given** una página, **When** se sirve, **Then** la CSP incluye `default-src 'self'`, `object-src 'none'`, `base-uri 'none'` y `frame-ancestors 'none'`.
2. **Given** `NODE_ENV` distinto de `production`, **When** se sirve, **Then** `script-src` añade `'unsafe-eval'` y `connect-src` añade `ws:`/`wss:`.

---

### User Story 5 - Imagen Docker reproducible (Priority: P2)

El despliegue usa una imagen en Node 24 con Bun solo para instalar, salida `standalone`, usuario `node`, sistema de archivos de solo lectura salvo `/app/.data` y `HEALTHCHECK` sobre `/api/health`.

**Why this priority**: Next solo documenta Node como runtime y la imagen `oven/bun` sustituye `node` por Bun.

**Independent Test**: `docker build` seguido de `docker run --read-only --tmpfs /tmp` y `curl /api/health` (procedimiento del README; ver Pendientes).

**Acceptance Scenarios**:

1. **Given** que faltan las fuentes en el contexto, **When** se construye, **Then** el build falla con un mensaje que indica ejecutar `bun run fonts:setup`.
2. **Given** `SIGTERM`, **When** llega, **Then** la app pasa a apagado ordenado (`/api/health` responde 503 y las rutas marcadas rechazan con 503 `DRAINING`).

---

### User Story 6 - Fuentes con licencia, sin versionar y verificadas (Priority: P2)

Gotham (interfaz) y Address Sans Pro Cd (piezas) no se versionan. `bun run fonts:setup` las busca por nombre PostScript, las convierte a `.woff2` y rechaza cualquier archivo que no coincida con el manifiesto.

**Why this priority**: «Address Sans Pro SemiBold» de ancho normal es otra fuente y produciría piezas más anchas que la referencia.

**Independent Test**: `tests/integration/fonts-lib.test.ts` prueba la huella de anchos con una fuente simulada que cumple la interfaz `MeasurableFont` (sin archivos con licencia).

**Acceptance Scenarios**:

1. **Given** un archivo con el nombre PostScript correcto pero otros anchos, **When** se ejecuta `fonts:setup`, **Then** se descarta y se indican los glifos que no coinciden.
2. **Given** una fuente `.otf`, `.ttf` o con nombre opaco en la caché de Adobe, **When** se encuentra, **Then** se convierte a `.woff2` con `wawoff2`.
3. **Given** `--write-manifest`, **When** el archivo es válido, **Then** se fija su `sha256` en `manifest.json`.

---

### User Story 7 - Calidad y proceso como contrato (Priority: P3)

Los tests, el lint y las reglas de capas son obligatorios; las features nuevas siguen el flujo Spec Kit bajo la constitución.

**Why this priority**: protege el resto del sistema, pero no afecta al usuario final.

**Independent Test**: `bun run lint`, `bun run typecheck`, `bun run test` y `bun run build`.

**Acceptance Scenarios**:

1. **Given** un import de `@/server` desde `src/components` o `src/lib`, **When** se ejecuta `bun run lint`, **Then** falla por `no-restricted-imports`.
2. **Given** `request.json()` (o `formData`, `arrayBuffer`, `text`, `blob`) en `src/app/api`, **When** se ejecuta el lint, **Then** falla; el cuerpo se lee con `ctx.readBody()` o `ctx.readJson()`.
3. **Given** un literal de color en `sx` o `style` de `src/components`, **When** se ejecuta el lint, **Then** falla.

### Edge Cases

- `next build` evalúa las rutas: el entorno y los limitadores se inicializan en la primera petición, no al importar.
- `src/proxy.ts` no corre en la capa `react-server`, por eso `env-schema.ts` y `auth.ts` no importan `server-only`.
- Con `TRUST_PROXY_HOPS=0` se ignoran `X-Forwarded-Host`, `X-Forwarded-For` y `X-Request-Id`.
- Sin `Sec-Fetch-Site` ni `Origin`, una petición con CSRF activo se rechaza.
- Las variables `HTTP_PROXY`, `HTTPS_PROXY` o `NODE_USE_ENV_PROXY` impiden arrancar sin `QR_FETCH_DIRECT_EGRESS_CONFIRMED=true`.
- Con un fallo de validación en producción, `boot()` termina el proceso (`process.exit(1)`); en desarrollo relanza el error.
- Una contraseña de menos de 12 caracteres es rechazada por `bun run hash-password`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE validar el entorno con Zod (`EnvSchema`) al arrancar (`src/instrumentation.ts` → `boot`) y reportar todos los problemas juntos.
- **FR-002**: El sistema DEBE negarse a arrancar en producción con `AUTH_MODE=none` salvo `ALLOW_UNAUTHENTICATED=true`, sin `APP_ORIGINS` o `APP_ALLOWED_HOSTS`, o con storage local de base `http:`/`localhost` salvo `ALLOW_LOCAL_STORAGE_IN_PROD=true`.
- **FR-003**: El sistema DEBE exigir por modo: `basic` (`BASIC_AUTH_USER` y `BASIC_AUTH_PASSWORD_SHA256` de 64 hex) y `proxy` (`PROXY_SHARED_SECRET` de al menos 32 caracteres).
- **FR-004**: Los secretos `BASIC_AUTH_PASSWORD_SHA256`, `PROXY_SHARED_SECRET`, `STORAGE_ACCESS_KEY` y `STORAGE_SECRET_KEY` DEBEN admitir la variante `*_FILE`.
- **FR-005**: Todo Route Handler DEBE declararse con `withApiGuards`, salvo `GET /api/health`, `GET /api/storage/[...key]` y el redirect `GET /api/qr/[resortCode]/[service]`, que son públicos por diseño.
- **FR-006**: Las guardas DEBEN ejecutarse en este orden y cortar en el primer fallo: Host (421), autenticación (401), `Content-Type` exacto (415) y origen (403), apagado ordenado (503), rate limit (429), semáforo sin cola (429), `Content-Length` (413) y lectura acotada del cuerpo.
- **FR-007**: El `Content-Type` DEBE compararse sin parámetros; el origen DEBE comprobarse con `Sec-Fetch-Site` (`same-origin` o `none`) u `Origin` en `APP_ORIGINS`; el CSRF está activo por defecto en métodos no seguros y se puede pedir en GET.
- **FR-008**: El rate limit DEBE ser un token bucket en memoria por principal (o IP del salto de confianza) con límites por ruta configurables (`RATE_LIMIT_*_PER_MIN`) y un máximo de 10 000 claves.
- **FR-009**: El cuerpo DEBE leerse solo con `readBodyCapped` o `readJsonCapped` (límite por defecto 64 KiB); un JSON inválido devuelve 400 `BAD_REQUEST`.
- **FR-010**: Las respuestas de error DEBEN ser `{ code, message, requestId, details? }` con `Cache-Control: no-store`, y las respuestas correctas DEBEN llevar `X-Request-Id`.
- **FR-011**: Las páginas DEBEN autenticarse en `src/proxy.ts` con el mismo `authenticate` que las APIs.
- **FR-012**: `next.config.ts` DEBE definir la CSP y las cabeceras de seguridad, `output: "standalone"`, `poweredByHeader: false` y `serverExternalPackages: ["pdfkit", "fontkit"]`.
- **FR-013**: El `Dockerfile` DEBE usar Node 24 (`node:24-trixie-slim`) fijado por digest, instalar con Bun, correr como `node`, exponer el puerto 3000, definir `HEALTHCHECK` y `STOPSIGNAL SIGTERM`, y fallar si faltan las fuentes.
- **FR-014**: En `SIGTERM` el sistema DEBE entrar en apagado ordenado: `/api/health` responde 503 y las rutas con `rejectWhenDraining` responden 503.
- **FR-015**: `fonts:setup` DEBE verificar nombre PostScript, huella de anchos (tolerancia de ±1 por 1000 em) y `sha256` contra `assets/fonts/<familia>/manifest.json`, convertir a `.woff2` con `wawoff2` y buscar en `FONTS_SOURCE_DIR` (por defecto `~/Library/Fonts`) y en la caché de Adobe Fonts (`CoreSync/livetype`).
- **FR-016**: Los archivos de fuentes DEBEN excluirse de git (`.gitignore`) y los manifiestos DEBEN versionarse.
- **FR-017**: Vitest DEBE ejecutarse en tres proyectos (`unit`, `dom`, `integration`) con cobertura mínima de líneas del 85 % en `src/lib`, `src/server` y `src/schemas`; Playwright DEBE probar escritorio y móvil (390 × 844).
- **FR-018**: ESLint DEBE imponer las capas (`components` y `lib` no importan `server`; `lib` sin React ni Next, salvo `src/lib/state`), prohibir `any`, `as any`, `@ts-ignore`, `alert`, colores literales en `sx`/`style` y lectura directa del cuerpo en `src/app/api`.
- **FR-019**: Toda feature nueva DEBE seguir el flujo Spec Kit y la constitución `.specify/memory/constitution.md` (v1.0.0).

### Key Entities

Detalle en [`data-model.md`](data-model.md).

- **Env**: configuración validada del servidor.
- **AuthConfig / AuthResult**: modo y credenciales; principal resultante.
- **GuardConfig / RouteGuardOptions**: configuración global y opciones por ruta de las guardas.
- **FontManifest**: familia, versión, licencia y por archivo peso, `sha256`, nombre PostScript y huella de anchos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Los 9 casos de `parseEnv` pasan, incluido el reporte conjunto de problemas (`src/server/config/env-schema.test.ts`).
- **SC-002**: Cada código de las guardas (401, 403, 413, 415, 421, 429, 503, 500) está cubierto por un test (`src/server/http/guards.test.ts`).
- **SC-003**: El token bucket permite la ráfaga, bloquea, se recarga y acota las claves en memoria (`src/server/http/rate-limit.test.ts`).
- **SC-004**: La huella de la Address Sans Pro Cd acepta la fuente correcta, tolera ±1 y rechaza la SemiBold de ancho normal (`tests/integration/fonts-lib.test.ts`).
- **SC-005**: Las cabeceras de seguridad y la ausencia de `X-Powered-By` se comprueban en `tests/e2e/smoke.spec.ts`.
- **SC-006**: `bun run test` pasa completo (917 tests según el responsable; no se reejecutó al redactar este documento).
- **SC-007**: `Content-Disposition` de descargas se construye de forma segura (`src/server/http/content-disposition.test.ts`).

## Assumptions

- MVP de una réplica: rate limit, semáforos y cuota están en memoria.
- HTTPS y HSTS los termina un proxy delante de la app (documentado en §S8, no en el código).
- Bun gestiona dependencias y scripts; build y runtime corren en Node 24. `bun.lock` es el único lockfile versionado.
- Gotham (Hoefler & Co.) y Address Sans Pro Cd (Adobe Fonts) tienen licencia que debe confirmar el área legal; el repositorio no las distribuye.
- Los tests se ejecutan con `bun run test` (Vitest), no con `bun test`.

## Pendientes

- **No verificado**: el `docker build` y `docker run --read-only` con la configuración actual; el repositorio no contiene un test que lo automatice (README y §S11 describen el procedimiento).
- **No verificado**: la prueba de `docs/ARCHITECTURE.md` Fase 2 de ejecutar todo también con npm; `playwright.config.ts` usa `npm run build && npm start`.
- **No verificado**: la confirmación legal de que las licencias de Gotham y Address Sans Pro Cd cubren uso en servidor y uso web (§R2 del Registro de decisiones).
- `src/proxy.ts` y `src/server/boot.ts` no tienen test unitario propio (solo el E2E y las pruebas de `parseEnv`).
- `exactOptionalPropertyTypes` aparece en §S13 como «evaluar en la Fase 3»; no está activo en `tsconfig.json`.
