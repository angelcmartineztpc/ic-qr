import Typography from "@mui/material/Typography";

import { DashboardPanel } from "@/components/records/DashboardPanel";
import { AppShell } from "@/components/ui/AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <header className="flex flex-col gap-1">
        <Typography variant="h4" component="h1">
          Piezas de producción
        </Typography>
        <Typography color="text.secondary">Crea piezas de 50 × 50 mm con su QR y genera un PDF vectorial listo para Illustrator.</Typography>
      </header>
      <DashboardPanel />
    </AppShell>
  );
}
