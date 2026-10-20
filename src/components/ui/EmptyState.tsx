"use client";

import type { DragEventHandler, ReactNode } from "react";

export interface EmptyStateRootProps {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "data-testid"?: string;
  className?: string;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  children: ReactNode;
}

function Root({ className = "", children, ...rest }: EmptyStateRootProps) {
  return (
    <section
      {...rest}
      className={`flex flex-col items-center gap-5 rounded-t-2xl rounded-b-xl border border-divider bg-surface px-6 py-10 text-center shadow-2xs sm:px-10 sm:py-12 ${className}`.trim()}
    >
      {children}
    </section>
  );
}

function Visual({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
    >
      {children}
    </div>
  );
}

function Header({ children }: { children: ReactNode }) {
  return <div className="flex max-w-xl flex-col items-center gap-2">{children}</div>;
}

function Title({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="m-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
      {children}
    </h2>
  );
}

function Description({ children }: { children: ReactNode }) {
  return <p className="m-0 max-w-lg text-sm leading-relaxed text-muted sm:text-base">{children}</p>;
}

function Benefits({ children, label = "Qué incluye cada proyecto" }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-wrap items-center justify-center gap-2 p-0">
      {children}
    </ul>
  );
}

function BenefitItem({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface-subtle px-3 py-1 text-xs font-medium text-muted">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
      {children}
    </li>
  );
}

function PrimaryAction({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-center gap-3 pt-1">{children}</div>;
}

function SecondaryActions({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-2.5 border-t border-divider pt-4">
      {label ? <span className="text-xs font-medium text-muted">{label}</span> : null}
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Componente compuesto de estado vacío (First-Use Empty State) siguiendo Material Design 3 y `vercel-composition-patterns`.
 * Evita props booleanas: cada pantalla compone exactamente las piezas que necesita (Visual, Header, Benefits, PrimaryAction, SecondaryActions).
 */
export const EmptyState = {
  Root,
  Visual,
  Header,
  Title,
  Description,
  Benefits,
  BenefitItem,
  PrimaryAction,
  SecondaryActions,
};

