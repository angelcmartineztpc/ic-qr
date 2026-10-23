import type { Metadata } from "next";

import { AuditScreen } from "@/components/audit/AuditScreen";
import { AppShell, NavButton } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Auditar QRs desde PDF" };

export default function AuditPage() {
  return (
    <AppShell>
      <StepHeader
        title="Auditar QRs desde PDF"
        description="Sube el PDF de tus piezas y comprobamos que cada QR se lea y abra la página correcta. Tu PDF no sale de este equipo."
        actions={
          <NavButton href="/" variant="text">
            ← Volver al inicio
          </NavButton>
        }
      />
      <AuditScreen />
    </AppShell>
  );
}
