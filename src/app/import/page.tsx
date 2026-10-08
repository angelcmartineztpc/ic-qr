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
        description="Sube el archivo, revisa errores y duplicados y confirma. Si una fila trae Link del QR se usa ese QR; si no, se genera uno nuevo."
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
