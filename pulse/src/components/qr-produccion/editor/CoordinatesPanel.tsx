import { ToggleButton, ToggleButtonGroup } from "@/components/qr-produccion/ui";

import type { Box, Layout } from "@/types";

import type { EditResult } from "./editor-actions";
import styles from "./CoordinatesPanel.module.css";
import { NumberField } from "./NumberField";

export interface CoordinatesPanelProps {
  layout: Layout;
  box: keyof Layout;
  unit: "mm" | "cm";
  disabled: boolean;
  onBox(key: keyof Layout): void;
  onUnit(unit: "mm" | "cm"): void;
  onCommit(key: keyof Layout, box: Box): EditResult;
}

/** X / Y / ancho / alto en mm (o cm). El QR es cuadrado: ancho y alto van juntos. */
export function CoordinatesPanel({ layout, box, unit, disabled, onBox, onUnit, onCommit }: CoordinatesPanelProps) {
  const current = layout[box];
  const factor = unit === "cm" ? 0.1 : 1;
  const set = (patch: Partial<Box>) => onCommit(box, { ...current, ...patch, ...(box === "qr" && (patch.width !== undefined || patch.height !== undefined) ? { width: patch.width ?? patch.height ?? current.width, height: patch.height ?? patch.width ?? current.height } : {}) });
  const common = { unit, factor, disabled } as const;
  // `key` hace que el campo se vuelva a montar cuando el valor cambia desde fuera (arrastre, preset, deshacer).
  return (
    <section aria-label="Coordenadas" className={styles.panel}>
      <div className={styles.bar}>
        <ToggleButtonGroup size="small" exclusive value={box} onChange={(_, value) => typeof value === "string" && onBox(value as keyof Layout)} aria-label="Caja a editar">
          <ToggleButton value="qr">QR</ToggleButton>
          <ToggleButton value="content">Texto</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={unit} onChange={(_, value) => (value === "mm" || value === "cm") && onUnit(value)} aria-label="Unidad">
          <ToggleButton value="mm">mm</ToggleButton>
          <ToggleButton value="cm">cm</ToggleButton>
        </ToggleButtonGroup>
      </div>
      <div className={styles.fields}>
        <NumberField key={`x-${box}-${current.x}`} label="X" value={current.x} onCommit={(v) => set({ x: v })} {...common} />
        <NumberField key={`y-${box}-${current.y}`} label="Y" value={current.y} onCommit={(v) => set({ y: v })} {...common} />
        <NumberField key={`w-${box}-${current.width}`} label="Ancho" value={current.width} onCommit={(v) => set({ width: v })} {...common} />
        <NumberField key={`h-${box}-${current.height}`} label="Alto" value={current.height} onCommit={(v) => set({ height: v })} {...common} />
      </div>
    </section>
  );
}
