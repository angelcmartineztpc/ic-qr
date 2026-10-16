import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ElementType, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

import styles from "./Button.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

type Color = "primary" | "error" | "inherit";
type Size = "small" | "medium" | "large";

interface BaseProps {
  /** Ruta interna (react-router). */
  to?: string;
  /** URL externa (<a>). */
  href?: string;
  /** Componente a renderizar (p. ej. el `Link` de react-router, con `to`). */
  component?: ElementType;
  sx?: Sx;
}
type Native = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color" | "type">;

function renderRoot(props: BaseProps & Native & { className: string; autoFocus?: boolean }, ref: React.Ref<HTMLElement>) {
  const { to, href, component, sx, style, autoFocus, disabled, type, ...rest } = props;
  const common = { ...rest, style: mergeStyle(style, sx), ref, ...(autoFocus ? { autoFocus, "data-autofocus": "" } : {}) };
  if (component) {
    const C = component;
    return <C {...common} {...(to ? { to } : {})} {...(href ? { href } : {})} {...(disabled ? { disabled, "aria-disabled": true } : {})} />;
  }
  if (to) return <RouterLink {...(common as object)} to={to} {...(disabled ? { "aria-disabled": true, tabIndex: -1 } : {})} />;
  if (href) return <a {...(common as object)} href={href} {...(disabled ? { "aria-disabled": true, tabIndex: -1 } : {})} />;
  return <button {...(common as object)} type={type ?? "button"} disabled={disabled} />;
}

export interface ButtonBaseProps extends BaseProps, Native {
  autoFocus?: boolean;
}

/** Botón sin estilo visual propio (solo reset + foco + objetivo táctil). */
export const ButtonBase = forwardRef<HTMLElement, ButtonBaseProps>(function ButtonBase({ className, ...props }, ref) {
  return renderRoot({ ...props, className: cx(styles.base, className) }, ref);
});

export interface ButtonProps extends Omit<ButtonBaseProps, "color"> {
  variant?: "contained" | "outlined" | "text";
  color?: Color;
  size?: Size;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  { variant = "text", color = "primary", size = "medium", startIcon, endIcon, loading, fullWidth, children, className, disabled, onClick, ...rest },
  ref,
) {
  const off = Boolean(disabled || loading);
  return renderRoot(
    {
      ...rest,
      disabled: off,
      "aria-busy": loading || undefined,
      onClick: off ? (e: React.MouseEvent<HTMLElement>) => e.preventDefault() : onClick,
      className: cx(styles.base, styles.button, styles[variant], styles[color], styles[size], fullWidth && styles.full, loading && styles.loading, className),
      children: (
        <>
          {loading ? <span className={styles.spinner} aria-hidden /> : startIcon ? <span className={styles.icon} aria-hidden>{startIcon}</span> : null}
          <span className={styles.label}>{children}</span>
          {endIcon ? <span className={styles.icon} aria-hidden>{endIcon}</span> : null}
        </>
      ),
    },
    ref,
  );
});

export interface IconButtonProps extends Omit<ButtonBaseProps, "color"> {
  size?: Size;
  color?: Color;
  edge?: "start" | "end" | false;
}

export const IconButton = forwardRef<HTMLElement, IconButtonProps>(function IconButton({ size = "medium", color = "inherit", edge: _edge, className, ...props }, ref) {
  return renderRoot({ ...props, className: cx(styles.base, styles.iconButton, styles[`icon_${color}`], styles[size], className) }, ref);
});

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color"> {
  to?: string;
  underline?: "none" | "hover" | "always";
  sx?: Sx;
}

/** Enlace de texto: `to` = ruta interna; `href` = externo. */
export function Link({ to, underline = "always", className, sx, style, ...rest }: LinkProps) {
  const cls = cx(styles.link, styles[`u_${underline}`], className);
  const st = mergeStyle(style, sx);
  return to ? <RouterLink to={to} className={cls} style={st} {...rest} /> : <a className={cls} style={st} {...rest} />;
}
