import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { PreviewScreen } from "@/components/editor/PreviewScreen";
import { AppShell } from "@/components/ui/AppShell";

export const metadata: Metadata = { title: "Generar PDF" };

export default function PreviewPage() {
  return (
    <AppShell>
      <header className="flex flex-col gap-1">
        <Typography variant="h4" component="h1">
          Generar PDF
        </Typography>
        <Typography color="text.secondary">Ajusta la composición de la pieza, elige las opciones de la hoja y revisa cómo quedará el PDF.</Typography>
      </header>
      <PreviewScreen />
    </AppShell>
  );
}
