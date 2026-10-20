"use client";

import * as React from "react";
import { startTransition, type ReactNode } from "react";

export interface ViewTransitionStageProps {
  name?: string;
  className?: string;
  children: ReactNode;
}

const NativeViewTransition = (
  React as unknown as {
    ViewTransition?: React.ComponentType<{ name?: string; children: ReactNode }>;
    unstable_ViewTransition?: React.ComponentType<{ name?: string; children: ReactNode }>;
  }
).ViewTransition ??
  (
    React as unknown as {
      unstable_ViewTransition?: React.ComponentType<{ name?: string; children: ReactNode }>;
    }
  ).unstable_ViewTransition;

/**
 * Envuelve regiones que alternan entre el estado vacío (First-Use Empty State) y el proyecto activo.
 * Usa `<ViewTransition>` de React 19 cuando el canal lo expone y aplica `view-transition-name` para el API nativo del navegador.
 */
export function ViewTransitionStage({ name = "workspace-stage", className, children }: ViewTransitionStageProps) {
  const content = (
    <div className={className} style={{ viewTransitionName: name }}>
      {children}
    </div>
  );

  if (NativeViewTransition) {
    return <NativeViewTransition name={name}>{content}</NativeViewTransition>;
  }
  return content;
}

/**
 * Ejecuta una transición de estado coordinada con `document.startViewTransition` cuando el navegador lo soporta,
 * respetando `prefers-reduced-motion: reduce` y degradando limpiamente a `React.startTransition` en tests/SSR.
 */
export function runViewTransition(update: () => void): void {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReduced) {
      try {
        (document as Document & { startViewTransition(cb: () => void): unknown }).startViewTransition(() => {
          startTransition(update);
        });
        return;
      } catch {
        // Fallback inmediato si startViewTransition falla en este contexto
      }
    }
  }
  startTransition(update);
}

