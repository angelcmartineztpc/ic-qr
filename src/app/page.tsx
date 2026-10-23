import { DashboardPanel } from "@/components/records/DashboardPanel";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export default function DashboardPage() {
  return (
    <AppShell>
      <StepHeader
        title="Piezas de producción"
        description="Generación de placas con códigos QR listas para impresión."
      />
      <DashboardPanel />
    </AppShell>
  );
}
