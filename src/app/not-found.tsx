import Typography from "@mui/material/Typography";

import { AppShell, NavButton } from "@/components/ui/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <Typography variant="h4" component="h1">
        Página no encontrada
      </Typography>
      <Typography color="text.secondary">No encontramos esta página. Puede que el enlace esté mal escrito o que ya no exista.</Typography>
      <div>
        <NavButton href="/">Volver al inicio</NavButton>
      </div>
    </AppShell>
  );
}
