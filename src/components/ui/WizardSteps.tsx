"use client";

import CheckIcon from "@mui/icons-material/Check";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { useProject, useSession } from "@/lib/state/StoreProvider";
import { isGenerating } from "@/lib/state/stores";

import { STEPS, type StepIndex } from "./steps";

/**
 * Stepper del flujo (Piezas → Diseño → Exportar). Cada paso es un enlace: se puede
 * volver atrás en cualquier momento; los pasos 2 y 3 esperan a que haya piezas.
 * En pantallas pequeñas se resume en «Paso N de 3» con tres marcas.
 */
export function WizardSteps({ active }: { active: StepIndex }) {
  const count = useProject(useShallow((p) => p.order.length));
  const busy = useSession((s) => isGenerating(s.generation));
  const locked = (index: number) => index > 0 && (count === 0 || busy);

  return (
    <nav aria-label="Pasos" data-testid="wizard-steps">
      <ol className="m-0 flex list-none items-center gap-2 p-0 max-sm:hidden">
        {STEPS.map((step, index) => {
          const done = index < active;
          const current = index === active;
          const disabled = locked(index);
          const body = (
            <>
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${current ? "bg-primary text-white" : done ? "bg-primary/15 text-primary" : "bg-black/10 text-muted"}`}
              >
                {done ? <CheckIcon sx={{ fontSize: 16 }} /> : index + 1}
              </span>
              <span className="flex flex-col text-left leading-tight">
                <span className={`text-sm ${current ? "font-bold text-foreground" : "font-medium text-foreground"}`}>{step.label}</span>
                <span className="text-sm text-muted">{step.hint}</span>
              </span>
            </>
          );
          return (
            <li key={step.id} className="flex flex-1 items-center gap-2">
              {disabled ? (
                <span aria-disabled="true" className="flex items-center gap-3 rounded-lg px-2 py-1 opacity-50">
                  {body}
                  <span className="sr-only">{busy ? "No disponible mientras se generan los QR" : "Disponible cuando haya piezas"}</span>
                </span>
              ) : (
                <Link href={step.href} aria-current={current ? "step" : undefined} className="flex items-center gap-3 rounded-lg px-2 py-1 text-inherit no-underline hover:bg-black/5">
                  {body}
                </Link>
              )}
              {index < STEPS.length - 1 ? <span aria-hidden className={`h-px flex-1 ${done ? "bg-primary" : "bg-divider"}`} /> : null}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-3 sm:hidden">
        <span className="text-sm font-semibold">
          Paso {active + 1} de {STEPS.length} · {STEPS[active]?.label}
        </span>
        <ol className="m-0 flex list-none gap-1.5 p-0" aria-hidden>
          {STEPS.map((step, index) => (
            <li key={step.id} className={`h-1.5 w-8 rounded-full ${index <= active ? "bg-primary" : "bg-black/15"}`} />
          ))}
        </ol>
      </div>
    </nav>
  );
}
