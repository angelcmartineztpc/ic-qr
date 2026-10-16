import { Alert, Button, FormControl, InputLabel, MenuItem, Select, ToggleButton, ToggleButtonGroup } from "@/components/qr-produccion/ui";

import { boxesOverlap } from "@/services/qr-produccion/layout/geometry";
import { detectPreset, QR_PRESETS } from "@/services/qr-produccion/layout/presets";
import type { Layout, QrPreset, TileSpec } from "@/types";

import styles from "./PositionControls.module.css";

export function QrPresetPicker({ layout, tile, disabled, onPreset }: { layout: Layout; tile: TileSpec; disabled: boolean; onPreset(preset: Exclude<QrPreset, "custom">): void }) {
  const current = detectPreset(layout.qr, tile);
  return (
    <FormControl size="small" fullWidth disabled={disabled}>
      <InputLabel id="qr-preset-label">Posición del QR</InputLabel>
      <Select labelId="qr-preset-label" label="Posición del QR" value={current} onChange={(e) => e.target.value !== "custom" && onPreset(e.target.value as Exclude<QrPreset, "custom">)}>
        {QR_PRESETS.map((preset) => (
          <MenuItem key={preset.id} value={preset.id} disabled={preset.id === "custom"}>
            {preset.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export interface ScopeSwitchProps {
  scope: "all" | "single";
  disabled: boolean;
  customized: boolean;
  /** Piezas con posición propia en la caja seleccionada, cuando se edita «Todas». */
  othersCustomized: number;
  onScope(scope: "all" | "single"): void;
  onReset(): void;
  onApplyToCustomized(): void;
}

/** «Todas» escribe en la base; «Solo esta pieza» en su propio override. */
export function ScopeSwitch({ scope, disabled, customized, othersCustomized, onScope, onReset, onApplyToCustomized }: ScopeSwitchProps) {
  return (
    <section aria-label="Ámbito del cambio" className={styles.scope}>
      <ToggleButtonGroup size="small" exclusive fullWidth value={scope} onChange={(_, value) => (value === "all" || value === "single") && onScope(value)} aria-label="Ámbito del cambio" disabled={disabled}>
        <ToggleButton value="all">Todas las piezas</ToggleButton>
        <ToggleButton value="single">Solo esta pieza</ToggleButton>
      </ToggleButtonGroup>
      {scope === "single" && customized ? (
        <Button size="small" onClick={onReset} disabled={disabled}>
          Restablecer esta pieza a la posición común
        </Button>
      ) : null}
      {scope === "all" && othersCustomized > 0 ? (
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={onApplyToCustomized} disabled={disabled}>Aplicar también a ellas</Button>}>
          {othersCustomized} {othersCustomized === 1 ? "pieza tiene" : "piezas tienen"} posición personalizada y no sigue este cambio.
        </Alert>
      ) : null}
    </section>
  );
}

export function OverlapAlert({ layout, onFit }: { layout: Layout; onFit(): void }) {
  if (!boxesOverlap(layout.qr, layout.content)) return null;
  return (
    <Alert severity="warning" role="alert" action={<Button color="inherit" size="small" onClick={onFit}>Ajustar bloque de texto</Button>}>
      El QR se solapa con el bloque de texto.
    </Alert>
  );
}
