"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BoltIcon from "@mui/icons-material/Bolt";
import Button from "@mui/material/Button";
import Link from "next/link";
import type { Route } from "next";
import { useId, type ReactNode } from "react";

export interface StepFooterProps {
  back?: { href: Route; label: string };
  /** Atajo opcional para saltar pasos de personalización (p. ej. ir directo a Exportar). */
  shortcut?: { href: Route; label: string; disabled?: boolean };
  next?: { href: Route; label: string; disabled?: boolean };
  /** Acción principal propia (p. ej. «Descargar PDF»); sustituye al botón «Siguiente». */
  primary?: ReactNode;
  /** Por qué no se puede avanzar (se muestra junto al botón). */
  note?: string;
}

/** Barra inferior fija con la navegación del paso: Atrás a la izquierda, lo siguiente a la derecha. */
export function StepFooter({ back, shortcut, next, primary, note }: StepFooterProps) {
  const noteId = useId();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-1 border-t border-divider bg-surface/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6" data-testid="step-footer">
      <div className="mx-auto flex w-full max-w-screen-xl flex-wrap items-center justify-between gap-3">
        {back ? (
          <Button component={Link} href={back.href} size="small" startIcon={<ArrowBackIcon fontSize="small" />} color="inherit">
            {back.label}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {note ? (
            <span id={noteId} className="text-xs font-medium text-muted">
              {note}
            </span>
          ) : null}
          {shortcut && !shortcut.disabled ? (
            <Button
              component={Link}
              href={shortcut.href}
              size="small"
              variant="outlined"
              startIcon={<BoltIcon fontSize="small" />}
              data-testid="step-shortcut"
            >
              {shortcut.label}
            </Button>
          ) : null}
          {primary ??
            (next ? (
              next.disabled ? (
                <Button size="small" variant="contained" endIcon={<ArrowForwardIcon fontSize="small" />} disabled {...(note ? { "aria-describedby": noteId } : {})}>
                  {next.label}
                </Button>
              ) : (
                <Button component={Link} href={next.href} size="small" variant="contained" endIcon={<ArrowForwardIcon fontSize="small" />} data-testid="step-next">
                  {next.label}
                </Button>
              )
            ) : null)}
        </div>
      </div>
    </div>
  );
}

