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
        Ocurrió un error inesperado.{error.digest ? ` Referencia: ${error.digest}` : ""}
      </Alert>
    </AppShell>
  );
}
