import { createContext, useContext, type ButtonHTMLAttributes, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";

import styles from "./ToggleButton.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

type Value = string | number;
interface Ctx {
  value: Value | Value[] | null | undefined;
  exclusive?: boolean;
  size: "small" | "medium";
  disabled?: boolean;
  fullWidth?: boolean;
  select: (e: MouseEvent<HTMLElement>, v: Value) => void;
}
const GroupCtx = createContext<Ctx | null>(null);

export interface ToggleButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: Value | Value[] | null;
  exclusive?: boolean;
  /** Exclusivo: recibe el valor o `null` si se pulsa el activo. No exclusivo: recibe el arreglo nuevo. */
  onChange?(event: MouseEvent<HTMLElement>, value: Value | Value[] | null): void; // método: bivariante, como MUI
  size?: "small" | "medium";
  disabled?: boolean;
  fullWidth?: boolean;
  sx?: Sx;
}

export function ToggleButtonGroup({ value, exclusive, onChange, size = "medium", disabled, fullWidth, className, style, sx, ...rest }: ToggleButtonGroupProps) {
  const select = (e: MouseEvent<HTMLElement>, v: Value) => {
    if (exclusive) onChange?.(e, value === v ? null : v);
    else {
      const cur = Array.isArray(value) ? value : [];
      onChange?.(e, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    }
  };
  return (
    <GroupCtx.Provider value={{ value, exclusive, size, disabled, fullWidth, select }}>
      <div role="group" className={cx(styles.group, fullWidth && styles.full, className)} style={mergeStyle(style, sx)} {...rest} />
    </GroupCtx.Provider>
  );
}

export interface ToggleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange"> {
  value?: Value;
  selected?: boolean;
  size?: "small" | "medium";
  onChange?: (event: MouseEvent<HTMLElement>, value: Value | undefined) => void;
  children?: ReactNode;
  sx?: Sx;
}

export function ToggleButton({ value, selected, size, onChange, onClick, className, style, sx, disabled, ...rest }: ToggleButtonProps) {
  const g = useContext(GroupCtx);
  const on = selected ?? (g && value !== undefined ? (Array.isArray(g.value) ? g.value.includes(value) : g.value === value) : false);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled ?? g?.disabled}
      className={cx(styles.btn, (size ?? g?.size) === "small" && styles.small, on && styles.on, g?.fullWidth && styles.flex, className)}
      style={mergeStyle(style, sx)}
      onClick={(e) => {
        onClick?.(e);
        onChange?.(e, value);
        if (g && value !== undefined) g.select(e, value);
      }}
      {...rest}
    />
  );
}
