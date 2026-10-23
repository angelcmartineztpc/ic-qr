import type { Metadata } from "next";

import { UniversalGeneratorScreen } from "@/components/universal-qr/UniversalGeneratorScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Crear QR Rápido" };

export default function UniversalGeneratorPage() {
  return (
    <AppShell>
      <StepHeader
        title="Crear QR Rápido"
        description="Elige para qué lo necesitas, llena tus datos y descarga tu código listo para usar en digital o impreso."
      />
      <UniversalGeneratorScreen />
    </AppShell>
  );
}
