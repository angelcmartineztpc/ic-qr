/** Los pasos del flujo: lo que se ve en el Stepper y en cada pantalla. */
export const STEPS = [
  { id: "pieces", label: "Piezas", href: "/qr-produccion", hint: "Crea o importa las piezas" },
  { id: "style", label: "Estilo del QR", href: "/qr-produccion/estilo", hint: "Forma, colores y logo" },
  { id: "design", label: "Diseño", href: "/qr-produccion/diseno", hint: "Ajusta la composición" },
  { id: "export", label: "Exportar", href: "/qr-produccion/exportar", hint: "Descarga el PDF" },
] as const;

export type StepIndex = 0 | 1 | 2 | 3;
