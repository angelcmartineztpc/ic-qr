# Integración en el repo real de PULSE (pendiente: no hay acceso a `production-tracker`)

Este documento lista lo que hay que tocar **en PULSE** al fusionar este módulo. Nada de esto se hizo ni se probó: se escribió desde el arnés `pulse/`. Va en un PR **separado** del módulo.

## 1. Rol «QR Producción»
| Archivo en PULSE | Cambio |
|---|---|
| `src/types/index.ts` | Añadir `'QR Producción'` al literal `UserRole`. |
| `src/context/AuthContext.tsx` | Flags booleanas del rol (igual que las de `Animador`). |
| `src/App.tsx` → `HomeRedirect` | Redirección del rol a `/qr-produccion`. |
| SQL de PULSE | Dar de alta el rol donde PULSE guarde sus roles. |

## 2. Rutas y menú
- `src/App.tsx`: rutas lazy `/qr-produccion`, `/qr-produccion/{importar,estilo,diseno,exportar}` con `ProtectedRoute allowedRoles={['Admin','QR Producción']}` (ver `pulse/src/App.tsx`, que ya las declara).
- Providers: `StoreProvider`, `NotificationsProvider` y `ConfirmProvider` envuelven **solo** las rutas del módulo (en el arnés están sobre `<Routes>`; en PULSE colócalos en un layout de ruta del módulo para no afectar al resto).
- `src/components/layout/Sidebar.tsx`: enlace con icono `lucide-react` (`QrCode`), etiqueta i18n y visibilidad por rol.

## 3. Qué NO copiar (ARNÉS)
`index.html`, `src/main.tsx`, `src/index.css`, `src/integrations/supabase/client.ts`, `src/context/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/i18n/index.ts`. PULSE ya tiene los suyos; los del arnés solo son stubs con la misma forma (`useAuth`, `supabase`, `t(key, fallback)`).

## 4. Variables del tema
El módulo usa las variables de la guía y, además, estas **no** están en la guía y el arnés las define en `index.css`: `--bg-page`, `--bg-elevated`, `--bg-hover`, `--text-secondary`, `--text-disabled`, `--primary-hover`, `--on-primary`, `--overlay`. Mapearlas a las equivalentes de PULSE (o añadirlas) en los 3 temas.

## 5. Base de datos y funciones
- Aplicar `supabase/migrations/*_qr_produccion.sql` (= `patch-qr-produccion.sql`) y desplegar `supabase/functions/*`.
- **`qr_roles_del_usuario()`**: lee `public.user_roles(user_id, role)` o `public.profiles(id, roles[])`. Ajustar a donde PULSE guarde los roles. Es el único sitio.
- `supabase/seed.sql` crea una `user_roles` de prueba: **solo local**, no aplicar en PULSE.

## 6. Dependencias a autorizar (npm)
`qr`, `fflate`, `zustand`, `zundo`, `idb-keyval`, `@dnd-kit/{core,sortable,utilities}`, `@tanstack/react-virtual`, `@xmldom/xmldom`, `pdf-lib`. (Ya aprobadas por el responsable del proyecto; falta el visto bueno de PULSE.)

## 7. Variables de entorno
Frontend: `VITE_QR_DOMAIN` (dominio permanente de los QR, **definitivo antes de imprimir**). Servidor: `QR_PUBLIC_BASE` (el mismo valor), `QR_ALLOWED_ORIGINS`, `EXPORT_MAX_RECORDS`. Ver `.env.example` y `supabase/.env.example`.

## 8. Tipos
Los tipos del módulo están en `src/types/index.ts` del arnés. En PULSE hay que **anexarlos al final** de su `src/types/index.ts` (la guía exige archivo único); el bloque empieza en el comentario «Tipos del módulo QR Producción». `StorageProvider.id` hoy solo admite `local|s3|r2`.
