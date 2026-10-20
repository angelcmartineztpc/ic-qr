import type { Metadata } from "next";

import { PreviewScreen } from "@/components/editor/PreviewScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Diseño" };

export default function PreviewPage() {
  return (
    <AppShell step={2}>
      <StepHeader
        step={2}
        title="Diseña la pieza"
        description="Ajusta la diagramación en milímetros sobre la mesa de trabajo de 70 × 70 mm. Puedes aplicar el cambio a todo el lote o solo a la placa activa."
      />
      <PreviewScreen />
    </AppShell>
  );
}
