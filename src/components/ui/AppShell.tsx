"use client";

import QrCode2Icon from "@mui/icons-material/QrCode2";
import Button from "@mui/material/Button";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { useProject, useSession } from "@/lib/state/StoreProvider";

import type { StepIndex } from "./steps";
import { WizardSteps } from "./WizardSteps";

/** Proyecto abierto y estado de guardado, siempre visibles arriba a la derecha. */
function ProjectBadge() {
  const name = useProject((p) => p.name);
  const count = useProject((p) => p.order.length);
  const status = useSession((s) => s.persistence.status);
  if (count === 0 && name === "") return null;
  return (
    <p className="m-0 flex min-w-0 items-center gap-2 text-sm" data-testid="project-badge">
      <span className="truncate font-medium">{name || "Proyecto sin nombre"}</span>
      <span className="shrink-0 text-muted max-sm:hidden">
        · {count} {count === 1 ? "pieza" : "piezas"}
      </span>
      <span className="shrink-0 text-sm text-muted max-md:hidden">
        {status === "saving" ? "Guardando…" : status === "ok" ? "Guardado" : ""}
      </span>
    </p>
  );
}

/**
 * Marco de todas las pantallas: logotipo (vuelve al Inicio), proyecto abierto y, en los
 * pasos del flujo, el Stepper. Sin menú duplicado: el Stepper es la navegación.
 */
export function AppShell({ children, step }: { children: ReactNode; step?: StepIndex }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-20 border-b border-divider bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-h-10 min-w-10 shrink-0 items-center gap-2 text-inherit no-underline" aria-label="QR Production Generator: inicio">
            <QrCode2Icon color="primary" />
            <span className="text-base font-bold max-sm:hidden">QR Production Generator</span>
          </Link>
          <ProjectBadge />
        </div>
        {step !== undefined ? (
          <div className="mx-auto w-full max-w-screen-xl px-4 pb-3 sm:px-6">
            <WizardSteps active={step} />
          </div>
        ) : null}
      </header>
      <main id="contenido" className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 pt-6 pb-0 sm:px-6">
        {children}
      </main>
    </div>
  );
}

/** Botón de navegación interna usable desde Server Components (props serializables). */
export function NavButton({ href, children, variant = "contained" }: { href: Route; children: ReactNode; variant?: "contained" | "outlined" | "text" }) {
  return (
    <Button component={Link} href={href} variant={variant}>
      {children}
    </Button>
  );
}
