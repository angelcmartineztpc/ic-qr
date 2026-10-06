import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { AppShell, NavButton } from "@/components/ui/AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <header className="flex flex-col gap-1">
        <Typography variant="h4" component="h1">
          Piezas de producción
        </Typography>
        <Typography color="text.secondary">
          Crea piezas de 50 × 50 mm con su QR y genera un PDF vectorial listo para Illustrator.
        </Typography>
      </header>

      <section aria-label="Empezar" className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <Typography variant="h6" component="h2">
              Crear manualmente
            </Typography>
            <Typography color="text.secondary">
              Agrega piezas una a una con el formulario: área, estación, mesa, sub-grupo, concepto y
              links.
            </Typography>
          </CardContent>
          <CardActions className="px-4 pb-4">
            <NavButton href="/editor">+ Agregar nuevo</NavButton>
          </CardActions>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <Typography variant="h6" component="h2">
              Importar Excel
            </Typography>
            <Typography color="text.secondary">
              Sube un archivo .xlsx: cada fila se convierte en una pieza editable, con resumen de
              errores y duplicados.
            </Typography>
          </CardContent>
          <CardActions className="px-4 pb-4">
            <NavButton href="/import" variant="outlined">
              Importar Excel
            </NavButton>
          </CardActions>
        </Card>
      </section>
    </AppShell>
  );
}
