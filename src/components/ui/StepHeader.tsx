import type { ReactNode } from "react";

import { STEPS, type StepIndex } from "./steps";

/** Cabecera compacta de cada pantalla: «Paso N de 4», título en escala de 24px y descripción concisa. */
export function StepHeader({ step, title, description, actions }: { step?: StepIndex; title: string; description?: string; actions?: ReactNode }) {
  const isOptional = step !== undefined && STEPS[step]?.optional;
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {step !== undefined ? (
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
              Paso {step + 1} de {STEPS.length}
            </span>
          ) : null}
          {isOptional ? (
            <span className="inline-flex items-center rounded-md border border-divider bg-surface-subtle px-2 py-0.5 text-xs font-medium text-muted">
              Personalización opcional
            </span>
          ) : null}
        </div>
        {description ? <p className="m-0 max-w-3xl text-xs leading-relaxed text-muted sm:text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

