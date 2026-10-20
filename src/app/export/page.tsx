import type { Metadata } from "next";

import { ExportScreen } from "@/components/editor/ExportScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Exportar" };

export default function ExportPage() {
  return (
    <AppShell step={3}>
      <StepHeader
        step={3}
        title="Exporta el PDF"
        description="Configura la imposición del pliego o genera páginas individuales de 70 × 70 mm en vectores puros listos para producción."
      />
      <ExportScreen />
    </AppShell>
  );
}
