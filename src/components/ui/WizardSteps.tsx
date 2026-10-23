"use client";

import CheckIcon from "@mui/icons-material/Check";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { useProject, useSession } from "@/lib/state/StoreProvider";
import { isGenerating } from "@/lib/state/stores";

import { STEPS, type StepIndex } from "./steps";

/**
 * Stepper compacto del flujo (Piezas → Estilo del QR → Diseño → Exportar).
 * Cada paso es un enlace accesible de 36px de alto con indicador numérico/check e insignia opcional.
 */
export function WizardSteps({ active }: { active: StepIndex }) {
  const count = useProject(useShallow((p) => p.order.length));
  const busy = useSession((s) => isGenerating(s.generation));
  const locked = (index: number) => index > 0 && (count === 0 || busy);

  return (
    <nav aria-label="Pasos" data-testid="wizard-steps">
      <ol className="m-0 flex list-none items-center gap-1.5 p-0 max-sm:hidden">
        {STEPS.map((step, index) => {
          const done = index < active;
          const current = index === active;
          const disabled = locked(index);
          const body = (
            <>
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  current
                    ? "bg-primary text-white"
                    : done
                      ? "bg-primary/15 text-primary"
                      : "bg-surface border border-divider text-muted"
                }`}
              >
                {done ? <CheckIcon sx={{ fontSize: 13 }} /> : index + 1}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-left leading-none">
                <span className={`text-xs sm:text-sm ${current ? "font-bold text-primary" : "font-semibold text-foreground"}`}>{step.label}</span>
                {step.optional ? (
                  <span className="rounded border border-divider bg-surface px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted">
                    Opcional
                  </span>
                ) : null}
                <span className="hidden truncate text-xs text-muted xl:inline">· {step.hint}</span>
              </span>
            </>
          );
          return (
            <li key={step.id} className="flex flex-1 items-center gap-1.5">
              {disabled ? (
                <span aria-disabled="true" className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1 opacity-45">
                  {body}
                  <span className="sr-only">{busy ? "No disponible mientras se generan los QR" : "Disponible cuando haya piezas"}</span>
                </span>
              ) : (
                <Link
                  href={step.href}
                  aria-current={current ? "step" : undefined}
                  className={`flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1 text-inherit no-underline transition-colors ${
                    current ? "bg-surface shadow-2xs ring-1 ring-primary/30" : "hover:bg-surface"
                  }`}
                >
                  {body}
                </Link>
              )}
              {index < STEPS.length - 1 ? <span aria-hidden className={`h-px flex-1 ${done ? "bg-primary/50" : "bg-divider"}`} /> : null}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-3 sm:hidden">
        <span className="text-xs font-semibold">
          Paso {active + 1} de {STEPS.length} · {STEPS[active]?.label}
        </span>
        <ol className="m-0 flex list-none gap-1.5 p-0" aria-hidden>
          {STEPS.map((step, index) => (
            <li key={step.id} className={`h-1.5 w-7 rounded-full ${index <= active ? "bg-primary" : "bg-divider"}`} />
          ))}
        </ol>
      </div>
    </nav>
  );
}

