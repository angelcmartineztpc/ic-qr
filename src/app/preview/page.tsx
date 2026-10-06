import type { Metadata } from "next";

import { AppShell } from "@/components/ui/AppShell";
import { PlannedScreen } from "@/components/ui/PlannedScreen";

export const metadata: Metadata = { title: "Generar PDF" };

export default function PreviewPage() {
  return (
    <AppShell>
      <PlannedScreen
        title="Generar PDF"
        description="Editor visual final: ajusta posiciones, nombra el archivo y descarga el PDF vectorial."
        phase="Fase 8 (editor visual)"
      />
    </AppShell>
  );
}
