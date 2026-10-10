# Implementation Plan: Link estable del QR por resort y servicio

**Branch**: `007-link-estable-del-qr` (retrospectiva) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Resumen

El QR codifica `{dominio}/api/qr/{resortCode}/{service}` en lugar del destino. Un Route Handler de solo lectura busca el resort en una lista cerrada (`src/lib/resorts/properties.ts`) y responde `302` al destino vigente, o `404`. Un selector de resort y servicio (`ResortLinkPicker`) rellena el «Link del menú» en el formulario de pieza y en la importación. La lógica nació en `qr-api-created` (F001, F004) y se reescribió sobre `src/` en el commit `6da1e64`.

## Contexto técnico

- **Lenguaje/versión**: TypeScript estricto; Next.js 16.3.8 (App Router, Route Handlers), React 19.2.8.
- **Dependencias**: ninguna nueva. UI con `@mui/material` ^9.4.0 (`TextField select`, `MenuItem`) y Tailwind para el `grid`.
- **Almacenamiento**: ninguno; la lista de destinos está en código.
- **Pruebas**: Vitest (`bun run test`); `route.test.ts` y `properties.test.ts`. Sin test del componente ni E2E propio de esta ruta.
- **Plataforma**: servidor Node 24 (`output: standalone`); el selector corre en el navegador.
- **Configuración**: `NEXT_PUBLIC_QR_DOMAIN` (en `.env.example`), variable de compilación; vacía = `window.location.origin`.
- **Restricciones**: el dominio queda grabado en cada pieza; los destinos solo cambian con deploy.
- **Escala**: 9 resorts × 2 servicios; una búsqueda lineal en un arreglo de 9 elementos por petición.

## Constitution Check

Contra [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0:

- **I. Una sola fuente de verdad y capas**: cumple. `properties.ts` es el único dueño de resorts y destinos; vive en `src/lib` (isomórfico, sin `fs` ni React) y lo importan la ruta (servidor) y el selector (cliente). No hay import de `src/server/**` desde componentes.
- **II. Regla crítica del QR**: cumple. La feature no genera QR; solo produce el link que el usuario guarda como «Link del menú». La generación y la reutilización siguen en `/api/qr/resolve`.
- **III. El QR codifica un link estable**: cumple y es la implementación de este principio. Redirige 302 con `Cache-Control: no-store`, no acepta destinos arbitrarios, y el dominio es configurable pero debe ser permanente. Es la excepción documentada a «todo Route Handler usa `withApiGuards`» (principio VI): se justifica en la sección siguiente.
- **IV. Salida vectorial verificable**: no aplica; no toca SVG ni PDF.
- **V. Validación en cada frontera**: cumple con matiz. Los parámetros de ruta se validan por pertenencia a la lista (`findPropertyByCode`, `isService`) y fallan con `404`; no hay Zod porque no hay cuerpo. Los mensajes van en español.
- **VI. Seguridad por defecto**: excepción explícita y acotada. La ruta no usa `withApiGuards` y `src/proxy.ts` no la autentica (su `matcher` excluye `api/`), porque la abren los huéspedes. Es segura porque no lee cuerpo ni consulta, el destino sale solo de una lista escrita en código, no hay redirección abierta, no toca storage ni red, y no se cachea. No hay limitador de peticiones (ver Pendientes del spec).
- **VII. Tests y calidad**: cumple. Hay tests de la ruta y de la lista; sin `any` ni supresiones. Falta test del componente `ResortLinkPicker`.

## Estructura del proyecto

```text
src/lib/resorts/
├── properties.ts            # Property, Service, SERVICES, SERVICE_LABELS, properties, findPropertyByCode, isService, buildServiceUrl
└── properties.test.ts       # 4 tests
src/app/api/qr/[resortCode]/[service]/
├── route.ts                 # GET: 302 / 404, sin withApiGuards
└── route.test.ts            # 2 tests
src/components/forms/
├── ResortLinkPicker.tsx     # selector Resort + Servicio -> onPick(url)
└── RecordForm.tsx           # lo usa para rellenar menuUrl
src/components/import/ImportScreen.tsx   # lo usa para el link común (setDefaultMenu)
.env.example                 # NEXT_PUBLIC_QR_DOMAIN
README.md                    # sección «Link estable del QR»
```

**Decisión de estructura**: la lista vive en `src/lib` y no en `src/server` para que el selector del navegador y la ruta compartan la misma fuente sin duplicar datos.

## Decisiones y diferencias respecto a F001/F004

- La variable es `NEXT_PUBLIC_QR_DOMAIN`, no `QR_DOMAIN`: el selector corre en el cliente y necesita leerla.
- `buildServiceUrl(property, service, domain)` recibe el dominio como argumento y ya no lanza error si falta; el llamador usa `window.location.origin` como respaldo.
- La ruta se escribió sin `withApiGuards` a propósito (constitución III); su comentario de cabecera la equipara con `/api/storage`.
- La lista usa `resortCode` de 4 letras: PRPL, LBCU, LBLC, MPCU, MPNI, PRBP, PRCZ, TGCU, TGPC.

## Riesgos

- Dominio no definitivo: un QR grabado con un dominio provisional queda huérfano. Mitigación: decisión previa a producción (ver spec).
- Documentación desalineada: `docs/ARCHITECTURE.md` §A.5 no lista esta ruta; actualizar en el siguiente cambio de documentación.
