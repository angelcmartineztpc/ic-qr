import { useEffect, useId, useState, type ReactNode } from "react";

import styles from "./Tooltip.module.css";

export interface TooltipProps {
  title: ReactNode;
  arrow?: boolean;
  placement?: "top" | "bottom";
  children: ReactNode;
}

/** Tooltip CSS: aparece con hover/foco, se cierra con Escape y se asocia con aria-describedby. Envuelve el hijo en un <span>. */
export function Tooltip({ title, placement = "top", children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!title) return <>{children}</>;
  return (
    <span className={styles.wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} aria-describedby={open ? id : undefined}>
      {children}
      {open ? <span role="tooltip" id={id} className={`${styles.tip} ${styles[placement]}`}>{title}</span> : null}
    </span>
  );
}
