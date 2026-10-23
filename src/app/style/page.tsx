import type { Metadata } from "next";

import { QrStyleScreen } from "@/components/qr-style/QrStyleScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Estilo del QR" };

export default function QrStylePage() {
  return (
    <AppShell step={1}>
      <StepHeader
        step={1}
        title="Dale estilo al QR"
        description="Personaliza la geometría, el color de tinta y el isotipo central del QR sin alterar su enlace de destino. Las placas con arte QR propio mantienen su archivo original."
      />
      <QrStyleScreen />
    </AppShell>
  );
}
