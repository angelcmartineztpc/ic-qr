import type { Route } from "next";

/** Los tres pasos del flujo: lo que se ve en el Stepper y en cada pantalla. */
export const STEPS = [
  { id: "pieces", label: "Piezas", href: "/editor" as Route, hint: "Crea o importa las piezas" },
  { id: "design", label: "Diseño", href: "/preview" as Route, hint: "Ajusta la composición" },
  { id: "export", label: "Exportar", href: "/export" as Route, hint: "Descarga el PDF" },
] as const;

export type StepIndex = 0 | 1 | 2;
