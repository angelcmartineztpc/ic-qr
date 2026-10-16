import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton, TextField, Tooltip } from "@/components/qr-produccion/ui";
import type { HexColor } from "@/types";

import styles from "./ColorField.module.css";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Color con selector y campo hexadecimal. Elegir color con el selector dispara muchos
 * cambios seguidos: se confirma uno solo a los 150 ms (una entrada de deshacer, una petición de vista previa).
 * `custom` = el usuario fijó un color; si no, se usa el de la plantilla («Automático»).
 */
export function ColorField({
  label,
  value,
  custom,
  autoLabel,
  disabled,
  onChange,
  onReset,
}: {
  label: string;
  value: HexColor;
  custom: boolean;
  autoLabel: string;
  disabled?: boolean;
  onChange(next: HexColor): void;
  onReset(): void;
}) {
  const [draft, setDraft] = useState<string>(value);
  const [text, setText] = useState<string>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Cambio aún sin confirmar: si el campo se desmonta antes de los 150 ms, se confirma en vez de perderse.
  const pending = useRef<string | null>(null);
  const latestOnChange = useRef(onChange);
  useEffect(() => {
    latestOnChange.current = onChange;
  });

  // Si el valor cambia desde fuera (deshacer, restablecer), el campo lo sigue.
  const [seen, setSeen] = useState<string>(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
    setText(value);
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) latestOnChange.current(pending.current.toUpperCase() as HexColor);
    },
    [],
  );

  const commit = (next: string) => {
    setDraft(next);
    setText(next);
    clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(() => {
      pending.current = null;
      onChange(next.toUpperCase() as HexColor);
    }, 150);
  };

  return (
    <div className={styles.root}>
      <div className={styles.picker}>
        <input
          type="color"
          aria-label={label}
          value={draft.slice(0, 7).toLowerCase()}
          disabled={disabled}
          onChange={(event) => commit(event.target.value)}
          className={styles.swatch}
        />
        <span className={styles.labels}>
          <span className={styles.label}>{label}</span>
          <span className={styles.hintText}>
            {custom ? "Color propio" : autoLabel}
          </span>
        </span>
      </div>
      <div className={styles.hexRow}>
        <div className={styles.hex}>
          <TextField
            size="small"
            value={text}
            disabled={disabled}
            error={!HEX.test(text)}
            onChange={(event) => {
              setText(event.target.value);
              if (HEX.test(event.target.value)) commit(event.target.value);
            }}
            onBlur={() => setText(draft)}
            slotProps={{
              htmlInput: {
                "aria-label": `${label} (hexadecimal)`,
                maxLength: 7,
                spellCheck: false,
              },
            }}
          />
        </div>
        {/* Siempre ocupa su lugar: así los campos no se desalinean cuando aparece o desaparece. */}
        <Tooltip title="Volver al color automático">
          <span className={styles.reset}>
            <IconButton
              size="small"
              disabled={disabled || !custom}
              onClick={onReset}
              aria-label={`${label}: volver a automático`}
              className={custom ? "" : styles.hidden}
            >
              <RotateCcw size={18} />
            </IconButton>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
