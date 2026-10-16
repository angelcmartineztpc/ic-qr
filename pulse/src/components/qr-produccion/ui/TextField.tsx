import { createContext, forwardRef, useContext, useId, type ChangeEvent, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import styles from "./TextField.module.css";
import { cx, mergeStyle, type Sx } from "./utils";

/** Contexto que usa `MenuItem` para renderizarse como <option> dentro de un select nativo. */
export const NativeSelectContext = createContext(false);

interface FormControlCtx { size: "small" | "medium"; disabled?: boolean; fullWidth?: boolean; error?: boolean }
const FormControlContext = createContext<FormControlCtx | null>(null);

export interface FormControlProps extends HTMLAttributes<HTMLDivElement> {
  size?: "small" | "medium";
  disabled?: boolean;
  fullWidth?: boolean;
  error?: boolean;
  sx?: Sx;
}
export function FormControl({ size = "medium", disabled, fullWidth, error, className, style, sx, ...rest }: FormControlProps) {
  return (
    <FormControlContext.Provider value={{ size, disabled, fullWidth, error }}>
      <div className={cx(styles.formControl, fullWidth && styles.fullWidth, className)} style={mergeStyle(style, sx)} {...rest} />
    </FormControlContext.Provider>
  );
}

export function InputLabel({ className, ...rest }: HTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return <label className={cx(styles.label, className)} {...rest} />;
}
export function FormLabel({ className, ...rest }: HTMLAttributes<HTMLElement> & { component?: "legend" | "span" }) {
  return <span className={cx(styles.label, className)} {...rest} />;
}
export function FormGroup({ className, row, ...rest }: HTMLAttributes<HTMLDivElement> & { row?: boolean }) {
  return <div role="group" className={cx(styles.group, row && styles.row, className)} {...rest} />;
}
export function FormHelperText({ error, className, ...rest }: HTMLAttributes<HTMLParagraphElement> & { error?: boolean }) {
  return <p className={cx(styles.helper, error && styles.helperError, className)} {...rest} />;
}
export function InputAdornment({ position, children }: { position: "start" | "end"; children?: ReactNode }) {
  return <span className={cx(styles.adornment, position === "start" ? styles.adStart : styles.adEnd)}>{children}</span>;
}

type InputExtra = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "onChange" | "onBlur" | "onFocus" | "onKeyDown">;

export interface TextFieldProps {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: boolean;
  multiline?: boolean;
  rows?: number;
  minRows?: number;
  maxRows?: number;
  /** Renderiza un <select> nativo; los hijos son <option> o <MenuItem value>. */
  select?: boolean;
  type?: string;
  value?: string | number | readonly string[];
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  size?: "small" | "medium";
  fullWidth?: boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  /** `htmlInput` = atributos del <input> (min, max, maxLength, inputMode, aria-*…); `input` = adornos. */
  slotProps?: {
    htmlInput?: InputExtra & Record<string, unknown>;
    input?: { startAdornment?: ReactNode; endAdornment?: ReactNode };
    /** Ignorado en el select nativo (solo documentación de compatibilidad). */
    select?: unknown;
  };
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  sx?: Sx;
  "aria-label"?: string;
  "data-testid"?: string;
}

export const TextField = forwardRef<HTMLDivElement, TextFieldProps>(function TextField(props, ref) {
  const {
    label, helperText, error, multiline, rows, minRows, maxRows, select, type = "text", value, defaultValue, onChange, onBlur, onFocus, onKeyDown,
    size = "medium", fullWidth, required, disabled, readOnly, autoFocus, autoComplete, placeholder, name, id: idProp, startAdornment, endAdornment,
    slotProps, children, className, style, sx, "aria-label": ariaLabel, "data-testid": testId,
  } = props;
  const auto = useId();
  const id = idProp ?? auto;
  const helperId = helperText ? `${id}-help` : undefined;
  const start = startAdornment ?? slotProps?.input?.startAdornment;
  const end = endAdornment ?? slotProps?.input?.endAdornment;
  const extra = (slotProps?.htmlInput ?? {}) as Record<string, unknown>;
  const common = {
    id, name, value, defaultValue, onChange, onBlur, onFocus, onKeyDown, disabled, required, autoFocus,
    ...(autoFocus ? { "data-autofocus": "" } : {}),
    "aria-invalid": error || undefined,
    "aria-describedby": helperId,
    "aria-label": ariaLabel,
    className: styles.control,
    ...extra,
  };
  return (
    <div ref={ref} className={cx(styles.field, styles[size], fullWidth && styles.fullWidth, disabled && styles.disabled, className)} style={mergeStyle(style, sx)} data-testid={testId}>
      {label ? <label htmlFor={id} className={styles.label}>{label}{required ? <span aria-hidden> *</span> : null}</label> : null}
      <div className={cx(styles.box, error && styles.error, multiline && styles.multiline)}>
        {start ? <span className={cx(styles.adornment, styles.adStart)}>{start}</span> : null}
        {select ? (
          <NativeSelectContext.Provider value>
            <select {...(common as SelectHTMLAttributes<HTMLSelectElement>)} className={cx(styles.control, styles.select)}>{children}</select>
          </NativeSelectContext.Provider>
        ) : multiline ? (
          <textarea {...(common as TextareaHTMLAttributes<HTMLTextAreaElement>)} rows={rows ?? minRows ?? 3} style={maxRows ? { maxHeight: `${maxRows * 1.5}em` } : undefined} readOnly={readOnly} placeholder={placeholder} autoComplete={autoComplete} />
        ) : (
          <input {...(common as InputHTMLAttributes<HTMLInputElement>)} type={type} readOnly={readOnly} placeholder={placeholder} autoComplete={autoComplete} />
        )}
        {end ? <span className={cx(styles.adornment, styles.adEnd)}>{end}</span> : null}
      </div>
      {helperText ? <p id={helperId} className={cx(styles.helper, error && styles.helperError)}>{helperText}</p> : null}
    </div>
  );
});

export interface SelectProps {
  value?: string | number;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  /** id del <InputLabel> asociado. */
  labelId?: string;
  /** Solo compatibilidad con MUI; el texto visible lo da <InputLabel>. */
  label?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
}

/** Select nativo con la API de MUI; hijos: <MenuItem value> (se renderizan como <option>). */
export function Select({ labelId, label: _label, className, disabled, children, ...rest }: SelectProps) {
  const fc = useContext(FormControlContext);
  const isOff = disabled ?? fc?.disabled;
  return (
    <div className={cx(styles.box, styles.selectBox, className)}>
      <NativeSelectContext.Provider value>
        <select className={cx(styles.control, styles.select, fc?.size === "small" && styles.selectSmall)} aria-labelledby={labelId} disabled={isOff} {...rest}>
          {children}
        </select>
      </NativeSelectContext.Provider>
    </div>
  );
}
