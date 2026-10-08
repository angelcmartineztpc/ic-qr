"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useId, useState } from "react";

import { timeAgo } from "@/lib/format";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession } from "@/lib/state/stores";

import type { BuilderActions } from "./builder-actions";

/** Lista los registros que no se pudieron leer, con el motivo y su contenido original. */
function QuarantineDialog({ open, onClose, onDownload, onDiscard }: { open: boolean; onClose(): void; onDownload(): void; onDiscard(): void }) {
  const id = useId();
  const entries = useProject((p) => p.quarantine);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby={`${id}-title`}>
      <DialogTitle id={`${id}-title`}>Registros que no se pudieron leer ({entries.length})</DialogTitle>
      <DialogContent dividers>
        <p className="mt-0 text-sm text-muted">Se apartaron para no perder el resto del proyecto. Descárgalos para revisarlos o recuperarlos a mano.</p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {entries.map((entry, i) => (
            <li key={i} className="rounded border border-divider p-3">
              <strong className="text-sm">{entry.reason}</strong>
              <pre className="mb-0 mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(entry.raw, null, 2)?.slice(0, 2000)}</pre>
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={onDiscard}>Descartar</Button>
        <Button onClick={onDownload}>Descargar</Button>
        <Button variant="contained" onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Avisos permanentes sobre el guardado local y la pestaña escritora (§S6). Nada silencioso. */
/** `showRestored`: el aviso «Proyecto restaurado» solo tiene sentido al abrir el proyecto (Inicio y Piezas), no en cada paso. */
export function PersistenceBanners({ actions, showRestored = true }: { actions: BuilderActions; showRestored?: boolean }) {
  const runtime = useRuntime();
  const writer = useSession((s) => s.writer);
  const status = useSession((s) => s.persistence.status);
  const notices = useSession((s) => s.notices);
  const hydrated = useSession((s) => s.hydrated);
  const quarantined = useProject((p) => p.quarantine.length);
  const [viewing, setViewing] = useState(false);
  if (!hydrated) return null;

  const dismissRestored = () => patchSession(runtime.session, (s) => ({ notices: { ...s.notices, restored: null } }));

  return (
    <div className="flex flex-col gap-2" data-testid="persistence-banners">
      {writer === "read-only" ? (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => void runtime.takeOver()}>Tomar el control</Button>}>
          Este proyecto está abierto en otra pestaña (solo lectura).
        </Alert>
      ) : null}
      {status === "unavailable" ? (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={actions.saveProjectFile}>Guardar proyecto</Button>}>
          Este navegador no permite guardar en local: trabajas en memoria y se perderá al cerrar. Guarda el proyecto en un archivo.
        </Alert>
      ) : null}
      {status === "error" ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={actions.saveProjectFile}>Guardar proyecto</Button>}>
          No se pudo guardar en este navegador; exporta el proyecto para no perder los cambios.
        </Alert>
      ) : null}
      {notices.recoveredBackup ? (
        <Alert
          severity="error"
          action={
            <>
              <Button color="inherit" size="small" onClick={() => void actions.downloadBackup(notices.recoveredBackup as string)}>Descargar copia</Button>
              <Button color="inherit" size="small" onClick={() => patchSession(runtime.session, (s) => ({ notices: { ...s.notices, recoveredBackup: null } }))}>Cerrar</Button>
            </>
          }
        >
          No se pudo leer el proyecto guardado en este navegador. Se conservó una copia de seguridad y se empezó un proyecto vacío.
        </Alert>
      ) : null}
      {quarantined > 0 ? (
        <Alert
          severity="warning"
          action={
            <>
              <Button color="inherit" size="small" onClick={() => setViewing(true)}>Ver</Button>
              <Button color="inherit" size="small" onClick={actions.downloadQuarantine}>Descargar</Button>
              <Button color="inherit" size="small" onClick={() => void actions.discardQuarantine()}>Descartar</Button>
            </>
          }
        >
          {quarantined === 1 ? "1 registro no se pudo leer" : `${quarantined} registros no se pudieron leer`} y se apartó en cuarentena; el resto del proyecto está intacto.
        </Alert>
      ) : null}
      {showRestored && notices.restored ? (
        <Alert
          severity="info"
          action={
            <>
              <Button color="inherit" size="small" onClick={dismissRestored}>Continuar</Button>
              <Button color="inherit" size="small" onClick={() => void actions.newProject().then((ok) => ok && dismissRestored())}>Empezar nuevo</Button>
            </>
          }
        >
          Proyecto restaurado: {notices.restored.records} {notices.restored.records === 1 ? "pieza" : "piezas"} · modificado {timeAgo(notices.restored.modifiedAt)}
        </Alert>
      ) : null}
      <QuarantineDialog open={viewing} onClose={() => setViewing(false)} onDownload={actions.downloadQuarantine} onDiscard={() => void actions.discardQuarantine().then((ok) => ok && setViewing(false))} />
    </div>
  );
}
