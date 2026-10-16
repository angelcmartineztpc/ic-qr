import { createContext, useContext, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

import styles from "./Tabs.module.css";
import { cx } from "./utils";

type Value = string | number;
interface Ctx { value: Value; select: (e: React.SyntheticEvent, v: Value) => void }
const TabsCtx = createContext<Ctx | null>(null);

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: Value;
  onChange?(event: React.SyntheticEvent, value: Value): void;
  variant?: "standard" | "scrollable" | "fullWidth";
}

export function Tabs({ value, onChange, variant = "standard", className, ...rest }: TabsProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not(:disabled)'));
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length];
    t?.focus();
    t?.click(); // activación automática: la selección sigue al foco
  };
  return (
    <TabsCtx.Provider value={{ value, select: (e, v) => onChange?.(e, v) }}>
      <div role="tablist" className={cx(styles.tabs, variant === "scrollable" && styles.scroll, variant === "fullWidth" && styles.fullWidth, className)} onKeyDown={onKeyDown} {...rest} />
    </TabsCtx.Provider>
  );
}

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: Value;
  label?: ReactNode;
}

export function Tab({ value, label, className, children, ...rest }: TabProps) {
  const c = useContext(TabsCtx);
  const on = c?.value === value;
  return (
    <button type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} className={cx(styles.tab, on && styles.on, className)} onClick={(e) => c?.select(e, value)} {...rest}>
      {label}{children}
    </button>
  );
}
