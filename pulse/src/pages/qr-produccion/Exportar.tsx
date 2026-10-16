import { AppShell } from "@/components/qr-produccion/layout/AppShell";
import { StepHeader } from "@/components/qr-produccion/layout/StepHeader";
import { ExportScreen } from "@/components/qr-produccion/editor/ExportScreen";

export default function Exportar() {
  return (
    <AppShell step={3}>
      <StepHeader step={3} title="Exporta el PDF" description="Elige cómo se colocan las piezas en la hoja, ponle nombre y descarga. Los QR pendientes se generan al descargar." />
      <ExportScreen />
    </AppShell>
  );
}
