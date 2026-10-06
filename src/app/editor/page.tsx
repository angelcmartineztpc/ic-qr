import type { Metadata } from "next";

import { AppShell } from "@/components/ui/AppShell";
import { PlannedScreen } from "@/components/ui/PlannedScreen";

export const metadata: Metadata = { title: "Piezas" };

export default function EditorPage() {
  return (
    <AppShell>
      <PlannedScreen
        title="Piezas"
        description="Document builder: navega, edita, duplica, elimina y reordena las piezas."
        phase="Fase 6 (estado, document builder y formulario manual)"
      />
    </AppShell>
  );
}
