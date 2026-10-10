import type { Metadata } from "next";

import { ExportScreen } from "@/components/editor/ExportScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Exportar" };

export default function ExportPage() {
  return (
    <AppShell step={2}>
      <StepHeader step={2} title="Exporta el PDF" description="Elige cómo se colocan las piezas en la hoja, ponle nombre y descarga. Los QR pendientes se generan al descargar." />
      <ExportScreen />
    </AppShell>
  );
}
