"use client";

import CloseIcon from "@mui/icons-material/Close";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import type { ReactNode } from "react";

export type ModalTone = "primary" | "warning" | "error";

const TONE_CLASSES: Record<ModalTone, string> = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
};

export interface ModalHeaderProps {
  id: string;
  icon?: ReactNode;
  tone?: ModalTone;
  badge?: ReactNode;
  onClose?: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
}

function Header({ id, icon, tone = "primary", badge, onClose, closeDisabled, children }: ModalHeaderProps) {
  return (
    <DialogTitle id={id} className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        {icon ? (
          <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
            {icon}
          </span>
        ) : null}
        <span className="truncate">{children}</span>
        {badge}
      </div>
      {onClose ? (
        <IconButton size="small" aria-label="Cerrar" onClick={onClose} disabled={closeDisabled} edge="end">
          <CloseIcon fontSize="small" />
        </IconButton>
      ) : null}
    </DialogTitle>
  );
}

export interface ModalBodyProps {
  dividers?: boolean;
  className?: string;
  children: ReactNode;
}

function Body({ dividers = true, className = "flex flex-col gap-4", children }: ModalBodyProps) {
  return (
    <DialogContent dividers={dividers} className={className}>
      {children}
    </DialogContent>
  );
}

function Callout({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-lg border border-divider bg-surface-subtle p-3 ${className}`.trim()}>{children}</div>;
}

export interface ModalFooterProps {
  /** Acción secundaria o de cierre a la izquierda (p. ej. Cancelar / Descartar). */
  leading?: ReactNode;
  /** Acción principal única (variant="contained") y alternativa secundaria opcional a la derecha. */
  children: ReactNode;
  className?: string;
}

function Footer({ leading, children, className = "" }: ModalFooterProps) {
  if (leading) {
    return (
      <DialogActions className={`flex-wrap justify-between gap-2 border-t border-divider bg-surface-subtle/50 ${className}`.trim()}>
        <div className="flex items-center gap-2">{leading}</div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </DialogActions>
    );
  }
  return (
    <DialogActions className={`flex-wrap justify-between gap-2 border-t border-divider bg-surface-subtle/50 ${className}`.trim()}>
      {children}
    </DialogActions>
  );
}

/**
 * Primitivas compuestas para diálogos (Material Design 3 Dialogs + `vercel-composition-patterns`).
 * Garantiza jerarquía visual consistente, cierre con ✕/Escape y botón secundario a la izquierda / CTA primario a la derecha.
 */
export const ModalLayout = {
  Header,
  Body,
  Callout,
  Footer,
};

