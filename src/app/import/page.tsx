import type { Metadata } from "next";

import { AppShell } from "@/components/ui/AppShell";
import { PlannedScreen } from "@/components/ui/PlannedScreen";

export const metadata: Metadata = { title: "Importar Excel" };

export default function ImportPage() {
  return (
    <AppShell>
      <PlannedScreen
        title="Importar Excel"
        description="Sube un .xlsx, revisa errores y duplicados y confirma la importación."
        phase="Fase 7 (importación de Excel)"
      />
    </AppShell>
  );
}
