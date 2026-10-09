"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

import { AppShell } from "@/components/ui/AppShell";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <AppShell>
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={retry}>
            Reintentar
          </Button>
        }
      >
        Algo salió mal. Tu proyecto sigue guardado en este navegador. Pulsa «Reintentar»; si se repite, guarda el proyecto en un archivo y avisa al equipo.{error.digest ? ` Referencia: ${error.digest}` : ""}
      </Alert>
    </AppShell>
  );
}
