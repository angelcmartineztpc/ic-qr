# Feature Specification: Link estable del QR por resort y servicio

**Feature Branch**: `007-link-estable-del-qr` (retrospectiva; se desarrolló en la rama `integracion-front-back`, a partir de F001–F004 de `qr-api-created`)

**Created**: 2026-10-09

**Status**: Implemented

**Input**: El QR se graba en metal y no se puede reimprimir barato. Si cambia el destino (menú de alberca o de restaurante de un resort), el QR no debe cambiar.

Origen histórico: [F001](../F001-properties.md), [F004](../F004-stable-redirect.md) y el mapa de [`specs/README.md`](../README.md). Principio rector: III de la [constitución](../../.specify/memory/constitution.md). Contexto técnico: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §S2 (regla del QR) y §A.5 (lista de endpoints y guardas; no incluye esta ruta, ver «Pendientes»).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El huésped escanea y llega al destino vigente (Priority: P1)

Un huésped escanea el QR de una placa. El QR contiene `{dominio}/api/qr/{resortCode}/{service}`; esa ruta lo redirige al destino actual del resort y servicio, sin pedir autenticación.

**Why this priority**: es el valor de la feature; sin la redirección el QR grabado no llevaría a ningún sitio y cualquier cambio de destino obligaría a reimprimir.

**Independent Test**: llamar a `GET /api/qr/TGPC/pool` y comprobar `302` con `Location: https://pool-service.palaceresorts.com/pool-area/TGPC` y `Cache-Control: no-store` (`src/app/api/qr/[resortCode]/[service]/route.test.ts`).

**Acceptance Scenarios**:

1. **Given** un resort y servicio de la lista, **When** se pide `/api/qr/{resortCode}/{service}`, **Then** la respuesta es `302` con `Location` igual a `serviceUrls[service]` y `Cache-Control: no-store`.
2. **Given** un `resortCode` fuera de la lista, **When** se pide la ruta, **Then** la respuesta es `404` con `{"error":"Resort o servicio desconocido"}` y `Cache-Control: no-store`.
3. **Given** un servicio distinto de `pool` y `restaurant` (p. ej. `spa`), **When** se pide la ruta, **Then** la respuesta es `404`.
4. **Given** un usuario sin sesión (modo de autenticación activo), **When** abre la ruta, **Then** no recibe `401`: la ruta no pasa por `src/proxy.ts` ni por `withApiGuards`.

---

### User Story 2 - Producción elige resort y servicio en lugar de pegar un link (Priority: P1)

Quien captura una pieza elige **Resort** y **Servicio** en un selector; el «Link del menú» de la pieza se rellena con la URL estable y de ahí sale el QR.

**Why this priority**: es lo que hace que los QR grabados codifiquen el link estable y no el destino directo.

**Independent Test**: en `src/lib/resorts/properties.test.ts`, `buildServiceUrl(TGCU, "restaurant", "https://qr.example.com/")` devuelve `https://qr.example.com/api/qr/TGCU/restaurant`. El componente `ResortLinkPicker` no tiene test propio (ver «Pendientes»).

**Acceptance Scenarios**:

1. **Given** el formulario de pieza (`RecordForm`), **When** se elige un resort y un servicio, **Then** el campo del link del menú se rellena con `{dominio}/api/qr/{resortCode}/{service}`.
2. **Given** la pantalla de importación (`ImportScreen`), **When** se eligen resort y servicio, **Then** ese link se usa como link común de las filas que no traen «Link del menú» o lo traen vacío.
3. **Given** `NEXT_PUBLIC_QR_DOMAIN` vacía, **When** se elige resort y servicio, **Then** el dominio es `window.location.origin` (uso de desarrollo).
4. **Given** el selector sin resort o sin servicio elegido, **When** el usuario cambia solo uno de los dos, **Then** no se rellena ningún link hasta tener ambos.

---

### User Story 3 - Cambiar un destino sin tocar los QR ya grabados (Priority: P2)

El equipo de producto cambia el destino de un resort editando `src/lib/resorts/properties.ts` y desplegando; los QR ya impresos siguen funcionando.

**Why this priority**: es la razón de ser del diseño, pero se ejerce rara vez y requiere deploy.

**Independent Test**: cambiar `serviceUrls` de un resort en `properties.ts` y repetir `GET /api/qr/{resortCode}/{service}`: el `Location` cambia y el QR (que solo codifica la ruta) no.

**Acceptance Scenarios**:

1. **Given** un QR que codifica `/api/qr/TGPC/pool`, **When** se modifica el destino de TGPC y se despliega, **Then** el mismo QR redirige al destino nuevo.
2. **Given** `properties.ts`, **When** se revisan los 9 resorts, **Then** cada destino de alberca termina en `/pool-area/{resortCode}` y cada destino de restaurante en `/restaurant/{resortCode}` (test «tiene 9 resorts…»).

### Edge Cases

- Código de resort con otra capitalización (p. ej. `tgpc`): `findPropertyByCode` compara por igualdad exacta, así que responde `404`.
- `/api/qr/resolve` y `/api/qr/asset` son segmentos únicos y no chocan con `/api/qr/[resortCode]/[service]`, que exige dos segmentos.
- `NEXT_PUBLIC_QR_DOMAIN` con barras finales: `buildServiceUrl` las elimina (`domain.replace(/\/+$/, "")`), sin doble barra.
- `NEXT_PUBLIC_QR_DOMAIN` es de tiempo de compilación (prefijo `NEXT_PUBLIC_`): cambiarla exige reconstruir; no es un dato que se pueda corregir sin deploy.
- Un cambio posterior del dominio no altera QR ya grabados: por eso debe ser permanente.
- Con el QR del link estable, la regla crítica sigue igual: el link estable es el «Link del menú» de la pieza y el QR se genera una vez y se reutiliza por sha256 del payload (constitución II).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mantener una lista fija de 9 resorts (`id`, `name`, `resortCode`) con un destino por cada servicio (`pool`, `restaurant`) en `src/lib/resorts/properties.ts`.
- **FR-002**: El sistema DEBE exponer `GET /api/qr/{resortCode}/{service}` que responda `302` con `Location` igual al destino de la lista y `Cache-Control: no-store`.
- **FR-003**: El sistema DEBE responder `404` (JSON `{ error }`, `Cache-Control: no-store`) cuando el resort o el servicio no pertenezcan a la lista.
- **FR-004**: La ruta DEBE obtener el destino únicamente de la lista; NO DEBE aceptar destinos, parámetros de consulta ni cuerpo que influyan en `Location`.
- **FR-005**: La ruta DEBE ser accesible sin autenticación, porque la abren los huéspedes al escanear; es la única ruta de la aplicación definida a propósito como pública y sin guardas (véase «Seguridad» abajo).
- **FR-006**: El sistema DEBE construir la URL del QR como `{dominio}/api/qr/{resortCode}/{service}` con `buildServiceUrl`, sin barra doble.
- **FR-007**: El formulario de pieza y la importación DEBEN ofrecer el selector `ResortLinkPicker` («Resort» y «Servicio») que rellena el link del menú con esa URL.
- **FR-008**: El dominio DEBE tomarse de `NEXT_PUBLIC_QR_DOMAIN` y, si está vacía, de `window.location.origin`.
- **FR-009**: Las etiquetas de servicio DEBEN ser «Alberca (pool)» y «Restaurante» (`SERVICE_LABELS`); los resorts se muestran como «{nombre} ({código})».
- **FR-010**: El README DEBE documentar la feature en «Link estable del QR» y `.env.example` DEBE declarar `NEXT_PUBLIC_QR_DOMAIN`.

### Seguridad de la ruta pública

- `src/proxy.ts` autentica páginas con un `matcher` que excluye `api/`; por eso la ruta no se autentica allí.
- La ruta no usa `withApiGuards` (a diferencia de `resolve`, `asset`, `import/excel`, `export` y `preview/tiles`): no valida Host, CSRF, límites ni tamaño de cuerpo.
- Es segura porque (a) no lee cuerpo ni consulta; (b) los dos parámetros de ruta solo sirven de clave de búsqueda en una lista cerrada (9 × 2 destinos escritos en código); (c) `Location` nunca contiene datos del cliente, así que no hay redirección abierta; (d) no toca storage, red ni estado; (e) responde sin caché.
- Excepciones análogas ya existentes: `GET /api/health` y `GET /api/storage/**` (solo con proveedor local) también están exentas de guardas. Por ello la afirmación «única ruta pública» es exacta solo para rutas de redirección; ver «Pendientes».

### Key Entities

- **Property**: resort con `id`, `name`, `resortCode` (4 letras) y `serviceUrls: Record<Service, string>`.
- **Service**: `"pool" | "restaurant"`, con `SERVICES` y `SERVICE_LABELS`.
- **URL estable**: cadena `{dominio}/api/qr/{resortCode}/{service}` que se guarda como «Link del menú» y es el payload del QR.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `GET /api/qr/TGPC/pool` devuelve 302 con el destino y `no-store`; `XXXX/pool` y `TGPC/spa` devuelven 404 (`src/app/api/qr/[resortCode]/[service]/route.test.ts`, 2 tests).
- **SC-002**: La lista tiene exactamente 9 resorts con códigos únicos y destinos que terminan en su código; TGPC apunta a los destinos reales (`src/lib/resorts/properties.test.ts`, 4 tests).
- **SC-003**: `buildServiceUrl` devuelve la URL estable, no el destino, y no duplica barras (mismo archivo de test).
- **SC-004**: Cambiar un destino no modifica ningún QR ya generado: el payload solo contiene la ruta estable (verificable por inspección de `buildServiceUrl`).
- **SC-005**: La suite completa (917 tests, `bun run test`) pasa con la feature integrada, según el cierre de la integración.

## Assumptions

- El dominio definitivo se fijará antes de producir piezas reales; mientras tanto el valor vacío (origen de la app) solo sirve para desarrollo.
- Los destinos son `https://pool-service.palaceresorts.com/pool-area/{código}` y `.../restaurant/{código}` (constante `BASE` de `properties.ts`).
- Esta aplicación estará desplegada en el dominio grabado en los QR, o ese dominio enrutará `/api/qr/*` hacia ella.
- Mantener los destinos en código es aceptable: cambiarlos requiere un deploy.
- El navegador de los huéspedes sigue redirecciones 302 normales; no se necesita página intermedia.

## Pendientes

Preguntas abiertas de F004 que siguen vigentes y puntos no verificados:

1. **Dominio definitivo**: F004 usaba como ejemplo `https://pool-service.palaceresorts.com`. No hay un dominio definitivo registrado en el repositorio; `.env.example` deja `NEXT_PUBLIC_QR_DOMAIN` vacía. Debe decidirse antes de grabar piezas, porque queda grabado para siempre.
2. **Enrutamiento con las rutas actuales de Palace**: los destinos viven en el mismo host (`/pool-area/{código}`, `/restaurant/{código}`). Si el dominio del QR es ese host, hay que coordinar que `/api/qr/*` llegue a esta aplicación sin chocar con las rutas existentes. No verificado.
3. **Cambiar destinos requiere deploy**: los destinos están en código; migrar a base de datos solo si se necesita editarlos sin desplegar.
4. **Sin límite de peticiones ni validación de Host** en la ruta pública: no verificado si el proxy/CDN de producción lo compensa.
5. **Documentación**: `docs/ARCHITECTURE.md` §A.5 enumera siete endpoints y solo exime de guardas a `/api/health` y `/api/storage/**`; la ruta de redirección (octava) no aparece. Tampoco hay test del componente `ResortLinkPicker` ni test del dominio `NEXT_PUBLIC_QR_DOMAIN` vacío.
