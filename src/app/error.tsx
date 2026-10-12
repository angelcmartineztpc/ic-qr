"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

import { AppShell } from "@/components/ui/AppShell";
import { useSession } from "@/lib/state/StoreProvider";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const unavailable = useSession((s) => s.persistence.status === "unavailable");
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
        {unavailable
          ? "Algo salió mal. Tu proyecto no se guarda en este navegador: guárdalo en un archivo antes de reintentar."
          : "Algo salió mal. Tu proyecto sigue guardado en este navegador. Pulsa «Reintentar»; si se repite, guarda el proyecto en un archivo y avisa al equipo."}
        {error.digest ? ` Referencia: ${error.digest}` : ""}
      </Alert>
    </AppShell>
  );
}
