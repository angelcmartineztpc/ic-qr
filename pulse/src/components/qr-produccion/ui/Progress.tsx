import type { CSSProperties, HTMLAttributes } from "react";

import styles from "./Progress.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

export interface LinearProgressProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "determinate" | "indeterminate";
  /** 0–100 */
  value?: number;
  color?: "primary" | "error";
  sx?: Sx;
}
export function LinearProgress({ variant = "indeterminate", value = 0, color = "primary", className, style, sx, ...rest }: LinearProgressProps) {
  const det = variant === "determinate";
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={det ? Math.round(pct) : undefined} className={cx(styles.linear, styles[color], className)} style={mergeStyle(style, sx)} {...rest}>
      <span className={cx(styles.bar, !det && styles.indeterminate)} style={det ? { width: `${pct}%` } : undefined} />
    </div>
  );
}

export interface CircularProgressProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number | string;
  color?: "primary" | "error" | "inherit";
  sx?: Sx;
}
export function CircularProgress({ size = 40, color = "primary", className, style, sx, ...rest }: CircularProgressProps) {
  const s = typeof size === "number" ? `${size}px` : size;
  return (
    <span role="progressbar" className={cx(styles.circular, styles[`c_${color}`], className)} style={{ width: s, height: s, ...mergeStyle(style, sx) }} {...rest}>
      <svg viewBox="22 22 44 44" aria-hidden><circle cx="44" cy="44" r="20.2" fill="none" strokeWidth="3.6" /></svg>
    </span>
  );
}

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "text" | "rectangular" | "rounded" | "circular";
  width?: number | string;
  height?: number | string;
  animation?: "pulse" | false;
  sx?: Sx;
}
export function Skeleton({ variant = "text", width, height, animation = "pulse", className, style, sx, ...rest }: SkeletonProps) {
  const dims: CSSProperties = { width, height };
  return <span className={cx(styles.skeleton, styles[`s_${variant}`], animation && styles.pulse, className)} style={{ ...dims, ...mergeStyle(style, sx) }} {...rest} />;
}
