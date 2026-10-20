import type { Route } from "next";

/** Los pasos del flujo: lo que se ve en el Stepper y en cada pantalla. */
export const STEPS = [
  { id: "pieces", label: "Piezas", href: "/editor" as Route, hint: "Contenido y códigos QR", optional: false },
  { id: "style", label: "Estilo del QR", href: "/style" as Route, hint: "Forma, color y marca", optional: true },
  { id: "design", label: "Diseño", href: "/preview" as Route, hint: "Composición en placa", optional: true },
  { id: "export", label: "Exportar", href: "/export" as Route, hint: "Pliego PDF vectorial", optional: false },
] as const;

export type StepIndex = 0 | 1 | 2 | 3;

