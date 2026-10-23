"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { useState } from "react";

import type { Template, TemplateOverrides } from "@/types";

import type { EditResult } from "./editor-actions";
import { NumberField } from "./NumberField";

type ItemOverride = NonNullable<TemplateOverrides["items"][string]>;

export interface TemplatePanelProps {
  template: Template;
  overrides: TemplateOverrides;
  disabled: boolean;
  onChange(next: TemplateOverrides): EditResult;
}

const ok: EditResult = { ok: true };

/** Ajustes editables de la plantilla (§1.2-27): por línea de texto, QR y fondo. Un valor no válido se rechaza con su motivo. */
export function TemplatePanel({ template, overrides, disabled, onChange }: TemplatePanelProps) {
  const [error, setError] = useState<string | null>(null);

  const apply = (next: TemplateOverrides): EditResult => {
    const result = onChange(next);
    setError(result.ok ? null : result.message);
    return result;
  };
  const patchItem = (id: string, patch: Partial<Record<keyof ItemOverride, ItemOverride[keyof ItemOverride] | undefined>>): EditResult => {
    const merged: Record<string, unknown> = { ...(overrides.items[id] ?? {}), ...patch };
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
    const items = { ...overrides.items };
    if (Object.keys(merged).length === 0) delete items[id];
    else items[id] = merged as ItemOverride;
    return apply({ ...overrides, items });
  };

  const hasOverrides = Object.keys(overrides.items).length > 0 || Object.keys(overrides.qr).length > 0 || Object.keys(overrides.tile).length > 0;
  const weightsOf = (family: string) => template.fonts.filter((f) => f.family === family).map((f) => f.weight);

  return (
    <section aria-label="Plantilla" className="flex flex-col gap-4">
      {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
      {template.content.items.map((item) => {
        const o = overrides.items[item.id] ?? {};
        const weights = weightsOf(item.font.family);
        return (
          <fieldset key={item.id} className="m-0 flex flex-col gap-2 rounded border border-divider p-3">
            <legend className="px-1 text-sm font-semibold">{item.id}</legend>
            <TextField size="small" label="Texto" value={o.text ?? item.text} disabled={disabled} helperText="Admite {{area}}, {{mesa}}…" onChange={(e) => void patchItem(item.id, { text: e.target.value === "" || e.target.value === item.text ? undefined : e.target.value })} />
            <div className="grid grid-cols-2 gap-x-3">
              <NumberField label="Tamaño" unit="pt" step={0.5} value={o.sizePt ?? item.sizePt} disabled={disabled} onCommit={(v) => patchItem(item.id, { sizePt: v === item.sizePt ? undefined : v })} />
              <NumberField label="Margen superior" unit="mm" value={o.marginTopMm ?? item.marginTopMm} disabled={disabled} onCommit={(v) => patchItem(item.id, { marginTopMm: v === item.marginTopMm ? undefined : v })} />
              <TextField select size="small" label="Alineación" value={o.align ?? item.align} disabled={disabled} onChange={(e) => void patchItem(item.id, { align: e.target.value === item.align ? undefined : (e.target.value as ItemOverride["align"]) })}>
                <MenuItem value="start">Izquierda</MenuItem>
                <MenuItem value="center">Centro</MenuItem>
                <MenuItem value="end">Derecha</MenuItem>
              </TextField>
              <TextField select size="small" label="Peso" value={o.weight ?? item.font.weight} disabled={disabled || weights.length < 2} helperText={weights.length < 2 ? "La tipografía solo tiene este peso" : " "} onChange={(e) => void patchItem(item.id, { weight: Number(e.target.value) === item.font.weight ? undefined : Number(e.target.value) })}>
                {weights.map((w) => (
                  <MenuItem key={w} value={w}>{w}</MenuItem>
                ))}
              </TextField>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                Color
                <input type="color" aria-label={`Color de ${item.id}`} value={(o.color ?? item.color).slice(0, 7)} disabled={disabled} onChange={(e) => void patchItem(item.id, { color: e.target.value === item.color.toLowerCase() ? undefined : (e.target.value as ItemOverride["color"]) })} />
              </label>
              <FormControlLabel control={<Switch checked={o.hidden === true} disabled={disabled} onChange={(e) => void patchItem(item.id, { hidden: e.target.checked ? true : undefined })} />} label="Ocultar" />
            </div>
          </fieldset>
        );
      })}

      <fieldset className="m-0 flex flex-col gap-2 rounded border border-divider p-3">
        <legend className="px-1 text-sm font-semibold">QR y fondo</legend>
        <NumberField label="Zona de silencio" unit="módulos" step={1} value={overrides.qr.quietZoneModules ?? template.qr.quietZoneModules} disabled={disabled} onCommit={(v) => apply({ ...overrides, qr: { ...overrides.qr, quietZoneModules: v === template.qr.quietZoneModules ? undefined : v } })} />
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            Color del QR
            <input type="color" aria-label="Color del QR" value={(overrides.qr.foreground ?? template.qr.foreground).slice(0, 7)} disabled={disabled} onChange={(e) => void apply({ ...overrides, qr: { ...overrides.qr, foreground: e.target.value as `#${string}` } })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            Fondo de la pieza
            <input type="color" aria-label="Fondo de la pieza" value={(overrides.tile.background ?? template.tile.background ?? "#ffffff").slice(0, 7)} disabled={disabled} onChange={(e) => void apply({ ...overrides, tile: { background: e.target.value as `#${string}` } })} />
          </label>
        </div>
      </fieldset>

      <Button variant="outlined" disabled={disabled || !hasOverrides} onClick={() => void apply({ items: {}, qr: {}, tile: {}, qrStyle: overrides.qrStyle })}>
        Restablecer a la plantilla
      </Button>
    </section>
  );
}

export { ok };
