import type { ReactNode } from "react";

import { ButtonBase } from "@/components/qr-produccion/ui";

import styles from "./ShapePicker.module.css";

export interface ShapeOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

/** Opciones con dibujo (como el selector de formas de qr-code-styling): un grupo de radios con teclado y lector de pantalla. */
export function ShapePicker<T extends string>({ label, value, options, disabled, onChange }: { label: string; value: T; options: ShapeOption<T>[]; disabled?: boolean; onChange(next: T): void }) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.grid}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <ButtonBase key={option.value} role="radio" aria-checked={selected} aria-label={option.label} disabled={disabled} onClick={() => onChange(option.value)} className={`${styles.option} ${selected ? styles.selected : ""}`.trim()}>
            <span aria-hidden className={styles.icon}>
              {option.icon}
            </span>
            <span className={styles.text}>{option.label}</span>
          </ButtonBase>
        );
      })}
    </div>
  );
}
