import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

/** Cabecera estándar de pantalla: un único h1 con la misma jerarquía en todas las rutas. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <Typography variant="h4" component="h1" className="!text-[1.75rem] sm:!text-[2.125rem]">
          {title}
        </Typography>
        {description ? (
          <Typography color="text.secondary" className="max-w-3xl">
            {description}
          </Typography>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
