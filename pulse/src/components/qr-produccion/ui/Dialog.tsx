import { useEffect, useRef, type HTMLAttributes, type ReactNode, type SyntheticEvent } from "react";

import styles from "./Dialog.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

export type DialogCloseReason = "backdropClick" | "escapeKeyDown";

export interface DialogProps {
  open: boolean;
  onClose?: (event: SyntheticEvent | Event, reason: DialogCloseReason) => void;
  fullWidth?: boolean;
  maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
  fullScreen?: boolean;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  sx?: Sx;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

/** Diálogo modal sobre <dialog> nativo: trampa de foco, Escape y restauración de foco los da el navegador. Solo monta los hijos mientras está abierto. */
export function Dialog({ open, onClose, fullWidth, maxWidth = "sm", fullScreen, className, style, sx, children, ...rest }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    if (typeof el.showModal === "function") {
      if (!el.open) el.showModal();
    } else {
      el.setAttribute("open", ""); // jsdom
    }
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (typeof el.close === "function" && el.open) el.close();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, fullScreen && styles.fullScreen, fullWidth && styles.fullWidth, maxWidth && styles[maxWidth], className)}
      style={mergeStyle(style, sx)}
      onCancel={(e) => {
        e.preventDefault(); // el cierre lo decide el padre (open)
        onClose?.(e, "escapeKeyDown");
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.(e, "backdropClick");
      }}
      {...rest}
    >
      <div className={styles.paper}>{children}</div>
    </dialog>
  );
}

export function DialogTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement> & { component?: string }) {
  const { component: _c, ...p } = rest as HTMLAttributes<HTMLHeadingElement> & { component?: string };
  return <h2 className={cx(styles.title, className)} {...p} />;
}
export function DialogContent({ className, dividers, ...rest }: HTMLAttributes<HTMLDivElement> & { dividers?: boolean }) {
  return <div className={cx(styles.content, dividers && styles.dividers, className)} {...rest} />;
}
export function DialogContentText({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(styles.text, className)} {...rest} />;
}
export function DialogActions({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.actions, className)} {...rest} />;
}
