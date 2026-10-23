// ARNÉS: stub de PULSE, no fusionar
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import ProtectedRoute from "@/components/ProtectedRoute";
import { ConfirmProvider } from "@/components/qr-produccion/layout/ConfirmDialog";
import { NotificationsProvider } from "@/components/qr-produccion/layout/NotificationsProvider";
import { AuthProvider } from "@/context/AuthContext";
import { StoreProvider } from "@/services/qr-produccion/state/StoreProvider";

const Piezas = lazy(() => import("@/pages/qr-produccion/Piezas"));
const EstiloQr = lazy(() => import("@/pages/qr-produccion/EstiloQr"));
const Diseno = lazy(() => import("@/pages/qr-produccion/Diseno"));
const Exportar = lazy(() => import("@/pages/qr-produccion/Exportar"));
const Importar = lazy(() => import("@/pages/qr-produccion/Importar"));

const queryClient = new QueryClient();
const ROLES = ["QR Producción" as const];

function guarded(el: React.ReactNode) {
  return <ProtectedRoute allowedRoles={ROLES}>{el}</ProtectedRoute>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <NotificationsProvider>
            <ConfirmProvider>
              <StoreProvider>
                <Suspense fallback={null}>
                  <Routes>
                    <Route path="/" element={guarded(<Piezas />)} />
                    <Route path="/qr-produccion" element={guarded(<Piezas />)} />
                    <Route path="/qr-produccion/importar" element={guarded(<Importar />)} />
                    <Route path="/qr-produccion/estilo" element={guarded(<EstiloQr />)} />
                    <Route path="/qr-produccion/diseno" element={guarded(<Diseno />)} />
                    <Route path="/qr-produccion/exportar" element={guarded(<Exportar />)} />
                  </Routes>
                </Suspense>
              </StoreProvider>
            </ConfirmProvider>
          </NotificationsProvider>
        </BrowserRouter>
        <Toaster richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
