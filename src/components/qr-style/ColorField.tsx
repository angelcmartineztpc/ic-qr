"use client";

import RestartAltIcon from "@mui/icons-material/RestartAlt";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";
import { useEffect, useRef, useState } from "react";

import type { HexColor } from "@/types";

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

  // Si el valor cambia desde fuera (deshacer, restablecer), el campo lo sigue.
  const [seen, setSeen] = useState<string>(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
    setText(value);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (next: string) => {
    setDraft(next);
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => onChange(next.toUpperCase() as HexColor),
      150,
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-[11rem] items-center gap-3">
        <input
          type="color"
          aria-label={label}
          value={draft.slice(0, 7).toLowerCase()}
          disabled={disabled}
          onChange={(event) => commit(event.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-divider bg-transparent p-0.5 disabled:cursor-not-allowed"
        />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted">
            {custom ? "Color propio" : autoLabel}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2 max-sm:pl-[3.75rem] sm:ml-auto">
        <TextField
          size="small"
          className="!w-[7.5rem] !shrink-0"
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
        {/* Siempre ocupa su lugar: así los campos no se desalinean cuando aparece o desaparece. */}
        <Tooltip title="Volver al color automático">
          <span className="shrink-0">
            <IconButton
              size="small"
              disabled={disabled || !custom}
              onClick={onReset}
              aria-label={`${label}: volver a automático`}
              className={custom ? "" : "!invisible"}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
