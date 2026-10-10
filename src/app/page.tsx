import { DashboardPanel } from "@/components/records/DashboardPanel";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export default function DashboardPage() {
  return (
    <AppShell>
      <StepHeader title="Piezas de producción" description="Crea piezas con su QR, ajusta su diseño y genera un PDF vectorial listo para Illustrator, en tres pasos: Piezas, Diseño y Exportar." />
      <DashboardPanel />
    </AppShell>
  );
}
