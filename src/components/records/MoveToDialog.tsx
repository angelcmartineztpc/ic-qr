"use client";

import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import FirstPageIcon from "@mui/icons-material/FirstPage";
import LastPageIcon from "@mui/icons-material/LastPage";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import TextField from "@mui/material/TextField";
import { useId, useState } from "react";

import { ModalLayout } from "@/components/ui/ModalLayout";

/** «Mover a posición N»: la forma de reordenar con 1000 piezas paginadas, en móvil o sin arrastrar. */
interface Props {
  open: boolean;
  label: string;
  current: number;
  total: number;
  onClose(): void;
  onMove(index: number): void;
}

export function MoveToDialog({ open, ...rest }: Props) {
  const id = useId();
  return (
    <Dialog open={open} onClose={rest.onClose} maxWidth="xs" fullWidth aria-labelledby={`${id}-title`}>
      <MoveToBody id={id} {...rest} />
    </Dialog>
  );
}

function MoveToBody({ id, label, current, total, onClose, onMove }: Omit<Props, "open"> & { id: string }) {
  const [value, setValue] = useState(String(current));
  const target = Number.parseInt(value, 10);
  const valid = Number.isInteger(target) && target >= 1 && target <= total;
  const go = (position: number) => {
    onMove(position - 1);
    onClose();
  };

  return (
    <>
      <ModalLayout.Header id={`${id}-title`} onClose={onClose}>
        Mover «{label}»
      </ModalLayout.Header>
      <ModalLayout.Body>
        <ModalLayout.Callout className="flex items-center justify-between gap-2 !px-3 !py-2 text-xs text-muted">
          <span>Posición actual en el lote</span>
          <Chip size="small" label={`#${current} de ${total}`} className="tabular-nums font-semibold" />
        </ModalLayout.Callout>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">Movimiento rápido en 1 clic</span>
          <div className="grid grid-cols-2 gap-2">
            <Button size="small" variant="outlined" startIcon={<FirstPageIcon fontSize="small" />} onClick={() => go(1)} disabled={current === 1}>
              Al inicio
            </Button>
            <Button size="small" variant="outlined" endIcon={<LastPageIcon fontSize="small" />} onClick={() => go(total)} disabled={current === total}>
              Al final
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArrowUpwardIcon fontSize="small" />}
              onClick={() => go(current - 1)}
              disabled={current <= 1}
            >
              Subir una (#{Math.max(1, current - 1)})
            </Button>
            <Button
              size="small"
              variant="outlined"
              endIcon={<ArrowDownwardIcon fontSize="small" />}
              onClick={() => go(current + 1)}
              disabled={current >= total}
            >
              Bajar una (#{Math.min(total, current + 1)})
            </Button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) go(target);
          }}
        >
          <TextField
            autoFocus
            label={`Nueva posición (1–${total})`}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={!valid}
            helperText={valid ? `Ahora está en la posición ${current}` : `Escribe un número entre 1 y ${total}`}
            slotProps={{ htmlInput: { min: 1, max: total, step: 1 } }}
          />
        </form>
      </ModalLayout.Body>
      <ModalLayout.Footer
        leading={
          <Button onClick={onClose} color="inherit">
            Cancelar
          </Button>
        }
      >
        <Button variant="contained" disabled={!valid || target === current} onClick={() => go(target)}>
          Mover
        </Button>
      </ModalLayout.Footer>
    </>
  );
}
