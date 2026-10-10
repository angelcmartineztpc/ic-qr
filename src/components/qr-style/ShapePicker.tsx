"use client";

import ButtonBase from "@mui/material/ButtonBase";
import type { ReactNode } from "react";

export interface ShapeOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

/** Opciones con dibujo (como el selector de formas de qr-code-styling): un grupo de radios con teclado y lector de pantalla. */
export function ShapePicker<T extends string>({ label, value, options, disabled, onChange }: { label: string; value: T; options: ShapeOption<T>[]; disabled?: boolean; onChange(next: T): void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <ButtonBase
            key={option.value}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`!flex !min-h-[5.5rem] !min-w-0 !flex-col !items-center !justify-start !gap-1.5 !rounded-lg !border !px-1.5 !py-2 !text-center !text-xs !leading-tight ${selected ? "!border-primary !bg-primary/10 !font-semibold !text-primary" : "!border-divider hover:!bg-black/5"}`}
          >
            <span aria-hidden className="flex h-9 w-9 items-center justify-center">{option.icon}</span>
            <span className="w-full text-balance break-words">{option.label}</span>
          </ButtonBase>
        );
      })}
    </div>
  );
}
