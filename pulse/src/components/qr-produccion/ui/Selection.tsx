import { Check, Minus } from "lucide-react";
import { cloneElement, createContext, isValidElement, useContext, type ChangeEvent, type HTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";

import styles from "./Selection.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

interface ControlProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>, checked: boolean) => void;
  disabled?: boolean;
  size?: "small" | "medium";
  color?: "primary" | "error";
  name?: string;
  value?: string;
  id?: string;
  /** Atributos del <input> (aria-label…). */
  inputProps?: InputHTMLAttributes<HTMLInputElement> & Record<string, unknown>;
  slotProps?: { input?: InputHTMLAttributes<HTMLInputElement> & Record<string, unknown> };
  className?: string;
  sx?: Sx;
  style?: React.CSSProperties;
}
export interface SwitchProps extends ControlProps {}
export interface CheckboxProps extends ControlProps { indeterminate?: boolean }
export interface RadioProps extends ControlProps {}

function Box({ kind, kindClass, mark, input, className, style, sx, disabled, size = "medium", color = "primary" }: {
  kind: "checkbox" | "radio" | "switch"; kindClass: string; mark: ReactNode; input: ReactElement; className?: string; style?: React.CSSProperties; sx?: Sx; disabled?: boolean; size?: string; color?: string;
}) {
  return (
    <span className={cx(styles.root, styles[kind], styles[kindClass], styles[color], size === "small" && styles.small, disabled && styles.disabled, className)} style={mergeStyle(style, sx)}>
      {input}
      <span className={styles.visual} aria-hidden>{mark}</span>
    </span>
  );
}

function inputAttrs(p: ControlProps) {
  return { ...p.inputProps, ...p.slotProps?.input } as InputHTMLAttributes<HTMLInputElement>;
}

export function Switch(p: SwitchProps) {
  return (
    <Box kind="switch" kindClass="switch" disabled={p.disabled} size={p.size} color={p.color} className={p.className} style={p.style} sx={p.sx}
      mark={<span className={styles.thumb} />}
      input={<input type="checkbox" role="switch" className={styles.input} checked={p.checked} defaultChecked={p.defaultChecked} disabled={p.disabled} name={p.name} id={p.id} value={p.value} onChange={(e) => p.onChange?.(e, e.target.checked)} {...inputAttrs(p)} />} />
  );
}

export function Checkbox(p: CheckboxProps) {
  return (
    <Box kind="checkbox" kindClass="checkbox" disabled={p.disabled} size={p.size} color={p.color} className={p.className} style={p.style} sx={p.sx}
      mark={p.indeterminate ? <Minus size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} className={styles.tick} />}
      input={<input type="checkbox" className={styles.input} checked={p.checked} defaultChecked={p.defaultChecked} disabled={p.disabled} name={p.name} id={p.id} value={p.value} ref={(el) => { if (el) el.indeterminate = Boolean(p.indeterminate); }} onChange={(e) => p.onChange?.(e, e.target.checked)} {...inputAttrs(p)} />} />
  );
}

interface GroupCtx { name?: string; value?: string; onChange?: (e: ChangeEvent<HTMLInputElement>, value: string) => void; disabled?: boolean }
const RadioCtx = createContext<GroupCtx | null>(null);

export function Radio(p: RadioProps) {
  const g = useContext(RadioCtx);
  const checked = g ? g.value === p.value : p.checked;
  return (
    <Box kind="radio" kindClass="radio" disabled={p.disabled ?? g?.disabled} size={p.size} color={p.color} className={p.className} style={p.style} sx={p.sx}
      mark={<span className={styles.dot} />}
      input={<input type="radio" className={styles.input} checked={checked} disabled={p.disabled ?? g?.disabled} name={p.name ?? g?.name} id={p.id} value={p.value} onChange={(e) => { g?.onChange?.(e, e.target.value); p.onChange?.(e, e.target.checked); }} {...inputAttrs(p)} />} />
  );
}

export interface RadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  value?: string;
  name?: string;
  row?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>, value: string) => void;
}
export function RadioGroup({ value, name, row, onChange, className, children, ...rest }: RadioGroupProps) {
  return (
    <RadioCtx.Provider value={{ value, name, onChange }}>
      <div role="radiogroup" className={cx(styles.group, row && styles.row, className)} {...rest}>{children}</div>
    </RadioCtx.Provider>
  );
}

export interface FormControlLabelProps {
  control: ReactElement<ControlProps>;
  label: ReactNode;
  value?: string;
  disabled?: boolean;
  labelPlacement?: "end" | "start";
  className?: string;
  style?: React.CSSProperties;
  sx?: Sx;
}
export function FormControlLabel({ control, label, value, disabled, labelPlacement = "end", className, style, sx }: FormControlLabelProps) {
  const el = isValidElement(control) ? cloneElement(control, { ...(value !== undefined ? { value } : {}), ...(disabled !== undefined ? { disabled } : {}) }) : control;
  return (
    <label className={cx(styles.fcl, labelPlacement === "start" && styles.fclStart, disabled && styles.fclDisabled, className)} style={mergeStyle(style, sx)}>
      {el}
      <span className={styles.fclText}>{label}</span>
    </label>
  );
}
