"use client";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { isDirty, orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";

import { StartOverDialog } from "@/components/records/StartOverDialog";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { ModalLayout } from "@/components/ui/ModalLayout";

const SECONDARY = "!rounded-full !border-divider !px-4";

/**
 * Cierre del flujo: al terminar una exportación ofrece qué hacer después (guardar, empezar de nuevo, volver o ir al inicio).
 * Un solo CTA primario: «Guardar proyecto» mientras haya cambios sin descargar; después, «Empezar un proyecto nuevo».
 */
export function ExportNextSteps() {
  const actions = useBuilderActions();
  const router = useRouter();
  const phase = useSession((s) => s.generation.phase);
  const name = useProject((p) => p.name);
  const count = useProject((p) => orderedRecords(p).length);
  const dirty = useProject((p) => isDirty(p));
  const [open, setOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const previous = useRef(phase);
  const titleId = useId();

  // Solo al terminar una exportación en esta pantalla, no al volver a ella con un resultado viejo.
  useEffect(() => {
    if (phase === "done" && previous.current !== "done") setOpen(true);
    previous.current = phase;
  }, [phase]);

  if (phase !== "done") return null;

  const startNew = async () => {
    setConfirmNew(false);
    setOpen(false);
    if (await actions.newProject({ confirmed: true })) router.push("/");
  };
  const requestNew = () => (dirty ? setConfirmNew(true) : void startNew());

  const save = (
    <Button variant={dirty ? "contained" : "outlined"} color={dirty ? "primary" : "inherit"} startIcon={<SaveAltIcon />} onClick={() => actions.saveProjectFile()} className={dirty ? "!rounded-full !px-5" : SECONDARY} data-testid="next-save">
      Guardar proyecto (.qrproj)
    </Button>
  );
  const fresh = (
    <Button variant={dirty ? "outlined" : "contained"} color={dirty ? "inherit" : "primary"} startIcon={<AddIcon />} onClick={requestNew} className={dirty ? SECONDARY : "!rounded-full !px-5"} data-testid="next-new">
      Empezar un proyecto nuevo
    </Button>
  );

  return (
    <>
      <section aria-label="Siguiente paso" data-testid="next-steps" className="flex flex-wrap items-center justify-between gap-3 rounded-t-[28px] rounded-b-xl border border-divider bg-surface p-4 sm:p-5">
        <p className="m-0 flex items-center gap-2 text-sm font-semibold">
          <CheckCircleOutlinedIcon color="success" fontSize="small" aria-hidden="true" />
          Flujo completado. ¿Qué sigue?
        </p>
        <Button variant="outlined" color="inherit" onClick={() => setOpen(true)} className={SECONDARY} data-testid="next-open">
          Ver opciones
        </Button>
      </section>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="xs"
        fullWidth
        aria-labelledby={titleId}
      >
        <ModalLayout.Header id={titleId} icon={<CheckCircleOutlinedIcon fontSize="small" />} tone="primary" onClose={() => setOpen(false)}>
          Exportación completada
        </ModalLayout.Header>
        <ModalLayout.Body dividers={false}>
          <p className="m-0 text-sm text-foreground/85">
            {dirty ? "Guarda el proyecto para poder retomarlo después, o elige cómo continuar." : "Tu proyecto está respaldado. Elige cómo continuar."}
          </p>
          <div className="flex flex-col items-stretch gap-2">
            {dirty ? save : fresh}
            {dirty ? fresh : save}
          </div>
        </ModalLayout.Body>
        <ModalLayout.Footer
          leading={
            <Button component={Link} href="/editor" color="inherit" size="small" startIcon={<EditOutlinedIcon fontSize="small" />} onClick={() => setOpen(false)} data-testid="next-editor">
              Volver al Editor
            </Button>
          }
        >
          <Button component={Link} href="/" color="inherit" size="small" startIcon={<DashboardOutlinedIcon fontSize="small" />} onClick={() => setOpen(false)} data-testid="next-dashboard">
            Ir al Dashboard
          </Button>
        </ModalLayout.Footer>
      </Dialog>

      <StartOverDialog open={confirmNew} projectName={name} pieceCount={count} onClose={() => setConfirmNew(false)} onSaveBackup={() => actions.saveProjectFile()} onConfirm={() => void startNew()} />
    </>
  );
}
