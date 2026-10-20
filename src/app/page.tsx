import { DashboardPanel } from "@/components/records/DashboardPanel";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export default function DashboardPage() {
  return (
    <AppShell>
      <StepHeader
        title="Piezas de producción"
        description="Prepara lotes de placas vectoriales de 70 × 70 mm con códigos QR reutilizables, listas para abrir en Illustrator o enviar a impresión."
      />
      <DashboardPanel />
    </AppShell>
  );
}
