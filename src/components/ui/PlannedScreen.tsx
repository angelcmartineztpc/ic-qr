import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";

/** Pantalla reservada para una fase del plan (docs/ARCHITECTURE.md §G) que aún no está implementada. */
export function PlannedScreen({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        <Typography color="text.secondary">{description}</Typography>
      </header>
      <Alert severity="info">Esta pantalla se implementa en la {phase}.</Alert>
    </>
  );
}
