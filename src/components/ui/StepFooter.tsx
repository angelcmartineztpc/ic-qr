"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Button from "@mui/material/Button";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

export interface StepFooterProps {
  back?: { href: Route; label: string };
  next?: { href: Route; label: string; disabled?: boolean };
  /** Acción principal propia (p. ej. «Descargar PDF»); sustituye al botón «Siguiente». */
  primary?: ReactNode;
  /** Por qué no se puede avanzar (se muestra junto al botón). */
  note?: string;
}

/** Barra inferior fija con la navegación del paso: Atrás a la izquierda, lo siguiente a la derecha. */
export function StepFooter({ back, next, primary, note }: StepFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-divider bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6" data-testid="step-footer">
      <div className="mx-auto flex w-full max-w-screen-xl flex-wrap items-center justify-between gap-3">
        {back ? (
          <Button component={Link} href={back.href} startIcon={<ArrowBackIcon />} color="inherit">
            {back.label}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {note ? <span className="text-sm text-muted">{note}</span> : null}
          {primary ??
            (next ? (
              next.disabled ? (
                <Button variant="contained" endIcon={<ArrowForwardIcon />} disabled>
                  {next.label}
                </Button>
              ) : (
                <Button component={Link} href={next.href} variant="contained" endIcon={<ArrowForwardIcon />} data-testid="step-next">
                  {next.label}
                </Button>
              )
            ) : null)}
        </div>
      </div>
    </div>
  );
}
