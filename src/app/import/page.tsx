import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { ImportScreen } from "@/components/import/ImportScreen";
import { AppShell } from "@/components/ui/AppShell";

export const metadata: Metadata = { title: "Importar Excel" };

export default function ImportPage() {
  return (
    <AppShell>
      <header className="flex flex-col gap-1">
        <Typography variant="h4" component="h1">
          Importar Excel
        </Typography>
        <Typography color="text.secondary">Sube un .xlsx, revisa errores y duplicados y confirma la importación. Si una fila trae Link del QR se usa ese QR; si no, se genera uno nuevo.</Typography>
      </header>
      <ImportScreen />
    </AppShell>
  );
}
