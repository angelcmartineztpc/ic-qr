"use client";

import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";

import { isDirty } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";

import type { StepIndex } from "./steps";
import { WizardSteps } from "./WizardSteps";

/**
 * Único indicador oficial de estado del proyecto (barra superior derecha).
 * Reemplaza los múltiples chips redundantes y explica con claridad el autoguardado local.
 */
function ProjectBadge() {
  const name = useProject((p) => p.name);
  const count = useProject((p) => p.order.length);
  const dirty = useProject((p) => isDirty(p));
  const status = useSession((s) => s.persistence.status);
  if (count === 0 && name === "") return null;

  const statusDotClass =
    status === "saving"
      ? "bg-amber-500 animate-pulse"
      : status === "error" || status === "unavailable"
        ? "bg-error"
        : "bg-success";

  const statusLabel =
    status === "saving"
      ? "Guardando…"
      : status === "error"
        ? "Error al guardar"
        : status === "unavailable"
          ? "Solo en memoria"
          : "Guardado";

  const tooltipText =
    status === "ok"
      ? dirty
        ? "Todos tus cambios están guardados automáticamente en este navegador. Si deseas llevar el archivo a otro equipo, usa el menú (⋮) → Guardar proyecto (.qrproj.json)."
        : "Proyecto guardado en este navegador y sincronizado con tu última copia descargada."
      : "Estado del almacenamiento local de este proyecto.";

  return (
    <Tooltip title={tooltipText} arrow>
      <p
        className="m-0 inline-flex min-w-0 items-center gap-2 rounded-lg border border-divider bg-surface-subtle px-2.5 py-1 text-xs"
        data-testid="project-badge"
      >
        <span className="truncate font-semibold text-foreground">{name || "Proyecto sin nombre"}</span>
        <span className="shrink-0 text-muted max-sm:hidden" aria-hidden="true">
          ·
        </span>
        <span className="shrink-0 font-medium text-muted tabular-nums max-sm:hidden">
          {count} {count === 1 ? "pieza" : "piezas"}
        </span>
        {statusLabel ? (
          <>
            <span className="shrink-0 text-muted max-md:hidden" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-muted max-md:hidden" aria-live="polite">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} aria-hidden="true" />
              {statusLabel}
            </span>
          </>
        ) : null}
      </p>
    </Tooltip>
  );
}

/**
 * Marco de todas las pantallas: logotipo (vuelve al Inicio), proyecto abierto y, en los
 * pasos del flujo, el Stepper compacto. Sin menú duplicado: el Stepper es la navegación.
 */
export function AppShell({ children, step }: { children: ReactNode; step?: StepIndex }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-20 border-b border-divider bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="flex min-h-9 min-w-9 shrink-0 items-center gap-2 rounded-lg text-inherit no-underline transition-opacity hover:opacity-85"
              aria-label="QR Production Generator: inicio"
            >
              <QrCode2Icon color="primary" fontSize="small" />
              <span className="text-sm font-bold tracking-tight max-sm:hidden">QR Production Generator</span>
            </Link>
            <span className="h-4 w-px bg-divider" aria-hidden="true" />
            <Link
              href="/"
              aria-current={isHome ? "page" : undefined}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold no-underline transition-colors ${
                isHome
                  ? "bg-primary/12 text-primary ring-1 ring-primary/25"
                  : "text-muted hover:bg-surface-subtle hover:text-foreground"
              }`}
            >
              <HomeOutlinedIcon sx={{ fontSize: 16 }} />
              <span>Inicio</span>
            </Link>
          </div>
          <ProjectBadge />
        </div>
        {step !== undefined ? (
          <div className="border-t border-divider bg-surface-subtle/60">
            <div className="mx-auto w-full max-w-screen-xl px-4 py-1.5 sm:px-6">
              <WizardSteps active={step} />
            </div>
          </div>
        ) : null}
      </header>
      <main id="contenido" className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-4 px-4 pt-4 pb-0 sm:px-6">
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
