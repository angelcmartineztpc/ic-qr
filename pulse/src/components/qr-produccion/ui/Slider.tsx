import type { ChangeEvent, KeyboardEvent, PointerEvent } from "react";

import styles from "./Slider.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

export interface SliderProps {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Recibe (evento, número), igual que MUI. */
  onChange?: (event: Event | ChangeEvent<HTMLInputElement>, value: number) => void;
  /** Se dispara al soltar (puntero) o con teclado. */
  onChangeCommitted?: (event: Event | React.SyntheticEvent, value: number) => void;
  id?: string;
  name?: string;
  className?: string;
  style?: React.CSSProperties;
  sx?: Sx;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-valuetext"?: string;
}

/** <input type="range"> estilizado. */
export function Slider({ value, defaultValue, min = 0, max = 100, step = 1, onChange, onChangeCommitted, className, style, sx, ...rest }: SliderProps) {
  const shown = value ?? defaultValue ?? min;
  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0;
  const commit = (e: PointerEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>) => onChangeCommitted?.(e, Number(e.currentTarget.value));
  return (
    <input
      type="range"
      className={cx(styles.slider, className)}
      style={{ ...mergeStyle(style, sx), ["--pct" as string]: `${pct}%` }}
      min={min}
      max={max}
      step={step}
      {...(value !== undefined ? { value } : { defaultValue })}
      onChange={(e) => onChange?.(e, Number(e.target.value))}
      onPointerUp={commit}
      onKeyUp={(e) => e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End" || e.key.startsWith("Page") ? commit(e) : undefined}
      {...rest}
    />
  );
}
