import type { Metadata } from "next";

import { ImportScreen } from "@/components/import/ImportScreen";
import { AppShell, NavButton } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Importar Excel" };

export default function ImportPage() {
  return (
    <AppShell step={0}>
      <StepHeader
        step={0}
        title="Importa desde Excel o CSV"
        description="Carga tu listado de mesas o ubicaciones, previsualiza el lote y confirma. Si una fila incluye un QR existente se conserva; para el resto se crean códigos nuevos."
        actions={
          <NavButton href="/editor" variant="text">
            ← Volver a las piezas
          </NavButton>
        }
      />
      <ImportScreen />
    </AppShell>
  );
}
