import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";

import styles from "./Card.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "elevation" | "outlined";
  sx?: Sx;
}
export function Card({ variant = "elevation", className, style, sx, ...rest }: CardProps) {
  return <div className={cx(styles.card, variant === "outlined" && styles.outlined, className)} style={mergeStyle(style, sx)} {...rest} />;
}

export const CardActionArea = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { sx?: Sx }>(function CardActionArea({ className, style, sx, ...rest }, ref) {
  return <button ref={ref} type="button" className={cx(styles.area, className)} style={mergeStyle(style, sx)} {...rest} />;
});

export function Divider({ className, orientation = "horizontal", ...rest }: HTMLAttributes<HTMLHRElement> & { orientation?: "horizontal" | "vertical" }) {
  return <hr role="separator" aria-orientation={orientation} className={cx(styles.divider, orientation === "vertical" && styles.vertical, className)} {...rest} />;
}
