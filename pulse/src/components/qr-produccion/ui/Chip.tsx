import type { HTMLAttributes, MouseEvent, ReactNode } from "react";

import styles from "./Chip.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

export interface ChipProps extends Omit<HTMLAttributes<HTMLElement>, "color" | "onClick"> {
  label: ReactNode;
  size?: "small" | "medium";
  color?: "default" | "primary" | "success" | "warning" | "error" | "info";
  variant?: "filled" | "outlined";
  icon?: ReactNode;
  /** Si existe, el chip es un botón. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  sx?: Sx;
}

export function Chip({ label, size = "medium", color = "default", variant = "filled", icon, onClick, className, style, sx, ...rest }: ChipProps) {
  const cls = cx(styles.chip, styles[size], styles[color], variant === "outlined" && styles.outlined, onClick && styles.clickable, className);
  const content = (
    <>
      {icon ? <span className={styles.icon} aria-hidden>{icon}</span> : null}
      <span className={styles.label}>{label}</span>
    </>
  );
  if (onClick) {
    return <button type="button" className={cls} style={mergeStyle(style, sx)} onClick={onClick} {...(rest as object)}>{content}</button>;
  }
  return <span className={cls} style={mergeStyle(style, sx)} {...rest}>{content}</span>;
}
