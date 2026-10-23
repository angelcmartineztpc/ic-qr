import { FileUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, Button, FormControlLabel, Slider, Switch } from "@/components/qr-produccion/ui";
import { ApiError } from "@/services/qr-produccion/app/api-client";
import { checkLogoBeforeUpload, uploadLogo } from "@/services/qr-produccion/app/qr-style-client";
import { LOGO_MAX_SIZE_PCT, LOGO_MIN_SIZE_PCT, type QrLogo } from "@/services/qr-produccion/schemas/qr-style";
import type { HexColor } from "@/types";

import { ColorField } from "./ColorField";
import styles from "./LogoControls.module.css";

/** Logo en SVG al centro del QR: se sube, se sanea en el servidor y se guarda solo su geometría vectorial. */
export function LogoControls({ logo, disabled, onChange }: { logo: QrLogo | null; disabled: boolean; onChange(next: QrLogo | null): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // El logo vigente al terminar la subida: si moviste un control mientras subía, no se pisa con el valor de antes.
  const latest = useRef(logo);
  useEffect(() => {
    latest.current = logo;
  });
  const [error, setError] = useState<string | null>(null);
  // Mientras se arrastra se muestra el valor en vivo; solo al soltar se guarda (una entrada de deshacer y una petición de vista previa).
  const [dragSize, setDragSize] = useState<number | null>(null);
  const [dragMargin, setDragMargin] = useState<number | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkLogoBeforeUpload(file);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const geometry = await uploadLogo(file);
      const current = latest.current;
      onChange({ geometry, sizePct: current?.sizePct ?? 20, marginModules: current?.marginModules ?? 1, color: current?.color ?? null, fileName: file.name.slice(0, 120) });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "No se pudo subir el logo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={styles.root}>
      <input ref={input} type="file" accept=".svg,image/svg+xml" hidden data-testid="logo-input" onChange={(event) => void pick(event.target.files?.[0])} />
      <div className={styles.row}>
        <Button variant={logo ? "outlined" : "contained"} startIcon={<FileUp size={18} />} disabled={disabled || busy} onClick={() => input.current?.click()}>
          {busy ? "Subiendo…" : logo ? "Cambiar logo" : "Subir logo (SVG)"}
        </Button>
        {logo ? (
          <>
            <span className={styles.name} data-testid="logo-name">{logo.fileName}</span>
            <Button variant="text" color="error" startIcon={<Trash2 size={18} />} disabled={disabled} onClick={() => onChange(null)}>
              Quitar
            </Button>
          </>
        ) : (
          <span className={styles.muted}>Solo SVG con contornos; se dibuja al centro sin perder nitidez.</span>
        )}
      </div>
      {error ? <Alert severity="error" role="alert" onClose={() => setError(null)}>{error}</Alert> : null}

      {logo ? (
        <div className={styles.root}>
          <div className={styles.field}>
            <span id="logo-size-label" className={styles.fieldLabel}>Tamaño del logo: {dragSize ?? logo.sizePct} % del QR</span>
            <Slider
              aria-labelledby="logo-size-label"
              value={dragSize ?? logo.sizePct}
              min={LOGO_MIN_SIZE_PCT}
              max={LOGO_MAX_SIZE_PCT}
              step={1}
              disabled={disabled}
              onChange={(_, v) => setDragSize(v as number)}
              onChangeCommitted={(_, v) => {
                setDragSize(null);
                onChange({ ...logo, sizePct: v as number });
              }}
            />
          </div>
          <div className={styles.field}>
            <span id="logo-margin-label" className={styles.fieldLabel}>Espacio libre alrededor: {dragMargin ?? logo.marginModules} {(dragMargin ?? logo.marginModules) === 1 ? "módulo" : "módulos"}</span>
            <Slider
              aria-labelledby="logo-margin-label"
              value={dragMargin ?? logo.marginModules}
              min={0}
              max={3}
              step={0.5}
              disabled={disabled}
              onChange={(_, v) => setDragMargin(v as number)}
              onChangeCommitted={(_, v) => {
                setDragMargin(null);
                onChange({ ...logo, marginModules: v as number });
              }}
            />
          </div>
          <FormControlLabel
            control={<Switch checked={logo.color !== null} disabled={disabled} onChange={(event) => onChange({ ...logo, color: event.target.checked ? ("#000000" as HexColor) : null })} />}
            label="Pintar el logo de un solo color"
          />
          {logo.color !== null ? (
            <ColorField label="Color del logo" value={logo.color} custom autoLabel="" disabled={disabled} onChange={(color) => onChange({ ...logo, color })} onReset={() => onChange({ ...logo, color: null })} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
