"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogContentText from "@mui/material/DialogContentText";
import FormControlLabel from "@mui/material/FormControlLabel";
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";

import { ModalLayout } from "./ModalLayout";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción destructiva: el botón de confirmar se pinta como error. */
  destructive?: boolean;
  /** Casilla opcional («No volver a preguntar en esta sesión»). */
  checkboxLabel?: string;
}

export interface ConfirmResult {
  confirmed: boolean;
  checked: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
type ConfirmDetailed = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<{ confirm: Confirm; confirmDetailed: ConfirmDetailed } | null>(null);

/**
 * Confirmación basada en promesas: `if (await confirm({...})) …`.
 * Sustituye a window.confirm (prohibido junto con alert por las reglas de calidad).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [checked, setChecked] = useState(false);
  const resolver = useRef<((value: ConfirmResult) => void) | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirmDetailed = useCallback<ConfirmDetailed>((next) => {
    resolver.current?.({ confirmed: false, checked: false });
    setChecked(false);
    setOptions(next);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const confirm = useCallback<Confirm>(async (next) => (await confirmDetailed(next)).confirmed, [confirmDetailed]);

  const settle = (confirmed: boolean) => {
    resolver.current?.({ confirmed, checked: confirmed && checked });
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm, confirmDetailed }}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => settle(false)}
        maxWidth="xs"
        fullWidth
        aria-labelledby={titleId}
        aria-describedby={options?.message ? descriptionId : undefined}
        slotProps={{
          paper: {
            className: "!rounded-t-2xl !rounded-b-xl !border !border-divider !bg-surface !bg-none",
          },
        }}
      >
        <ModalLayout.Header
          id={titleId}
          icon={<WarningAmberIcon fontSize="small" />}
          tone={options?.destructive ? "error" : "primary"}
          onClose={() => settle(false)}
        >
          {options?.title}
        </ModalLayout.Header>
        {options?.message || options?.checkboxLabel ? (
          <ModalLayout.Body dividers={false} className="flex flex-col gap-3">
            {options.message ? (
              <DialogContentText id={descriptionId} className="!m-0 !text-sm !text-foreground/80">
                {options.message}
              </DialogContentText>
            ) : null}
            {options.checkboxLabel ? (
              <ModalLayout.Callout className="!px-3 !py-1.5">
                <FormControlLabel
                  control={<Checkbox size="small" checked={checked} onChange={(e) => setChecked(e.target.checked)} />}
                  label={<span className="text-sm">{options.checkboxLabel}</span>}
                />
              </ModalLayout.Callout>
            ) : null}
          </ModalLayout.Body>
        ) : null}
        <ModalLayout.Footer
          leading={
            <Button onClick={() => settle(false)} color="inherit" variant="outlined" className="!rounded-full !border-divider !px-4" autoFocus>
              {options?.cancelLabel ?? "Cancelar"}
            </Button>
          }
        >
          <Button onClick={() => settle(true)} variant="contained" color={options?.destructive ? "error" : "primary"} className="!rounded-full !px-5">
            {options?.confirmLabel ?? "Aceptar"}
          </Button>
        </ModalLayout.Footer>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return context.confirm;
}

export function useConfirmDetailed(): ConfirmDetailed {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirmDetailed debe usarse dentro de <ConfirmProvider>");
  return context.confirmDetailed;
}

/** Texto estándar del spec §38 para salir con cambios sin guardar. */
export const UNSAVED_CHANGES_CONFIRM: ConfirmOptions = {
  title: "Tienes cambios sin guardar.",
  confirmLabel: "Salir sin guardar",
  cancelLabel: "Seguir aquí",
  destructive: true,
};
