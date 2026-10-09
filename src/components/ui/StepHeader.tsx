import type { ReactNode } from "react";

import { STEPS, type StepIndex } from "./steps";

/** Cabecera de cada pantalla: «Paso N de 3», un título y una sola línea que explica qué se hace aquí. */
export function StepHeader({ step, title, description, actions }: { step?: StepIndex; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        {step !== undefined ? (
          <p className="m-0 text-sm font-semibold uppercase tracking-wider text-primary">
            Paso {step + 1} de {STEPS.length}
          </p>
        ) : null}
        <h1 className="m-0 text-3xl font-bold leading-tight max-sm:text-2xl">{title}</h1>
        {description ? <p className="m-0 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
