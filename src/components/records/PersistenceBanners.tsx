"use client";

import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import { useId, useState } from "react";

import { timeAgo } from "@/lib/format";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession } from "@/lib/state/stores";

import { ModalLayout } from "@/components/ui/ModalLayout";

import type { BuilderActions } from "./builder-actions";

/** Lista los registros que no se pudieron leer, con el motivo y su contenido original. */
function QuarantineDialog({ open, onClose, onDownload, onDiscard }: { open: boolean; onClose(): void; onDownload(): void; onDiscard(): void }) {
  const id = useId();
  const entries = useProject((p) => p.quarantine);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby={`${id}-title`}>
      <ModalLayout.Header id={`${id}-title`} tone="warning">
        Piezas dañadas que se apartaron ({entries.length})
      </ModalLayout.Header>
      <ModalLayout.Body>
        <p className="mt-0 text-sm text-muted">
          Estas piezas no se pudieron leer y se apartaron para no perder el resto del proyecto. Descárgalas para revisarlas o recuperarlas a mano.
        </p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {entries.map((entry, i) => (
            <li key={i} className="rounded-lg border border-divider bg-surface-subtle p-3">
              <strong className="text-sm">{entry.reason}</strong>
              <pre className="mb-0 mt-2 max-h-40 overflow-auto rounded border border-divider bg-surface p-2 whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(entry.raw, null, 2)?.slice(0, 2000)}
              </pre>
            </li>
          ))}
        </ul>
      </ModalLayout.Body>
      <ModalLayout.Footer
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose} color="inherit">
              Cerrar
            </Button>
            <Button color="error" onClick={onDiscard}>
              Descartar
            </Button>
          </div>
        }
      >
        <Button variant="contained" onClick={onDownload}>
          Descargar
        </Button>
      </ModalLayout.Footer>
    </Dialog>
  );
}

/**
 * Avisos sobre el guardado local y la pestaña escritora (§S6).
 * El aviso informativo «Proyecto restaurado» se muestra como un Toast flotante no intrusivo
 * para no empujar el área de trabajo hacia abajo.
 */
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
  const hasInlineAlerts =
    writer === "read-only" ||
    status === "unavailable" ||
    status === "error" ||
    Boolean(notices.recoveredBackup) ||
    quarantined > 0;

  return (
    <div className={hasInlineAlerts ? "flex flex-col gap-2" : "contents"} data-testid="persistence-banners">
      {writer === "read-only" ? (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => void runtime.takeOver()}>Tomar el control</Button>}>
          Este proyecto está abierto en otra pestaña y aquí solo puedes verlo. Si pulsas «Tomar el control», editarás aquí y la otra pestaña pasará a solo lectura.
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
          {quarantined === 1 ? "1 pieza no se pudo leer y se apartó" : `${quarantined} piezas no se pudieron leer y se apartaron`}; el resto del proyecto está intacto.
        </Alert>
      ) : null}

      <Snackbar
        open={Boolean(showRestored && notices.restored)}
        autoHideDuration={8000}
        onClose={(_e, reason) => {
          if (reason === "clickaway") return;
          dismissRestored();
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        className="!bottom-16 sm:!bottom-16"
      >
        {showRestored && notices.restored ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-divider bg-surface px-3.5 py-2.5 text-xs text-foreground shadow-lg"
          >
            <HistoryIcon fontSize="small" className="shrink-0 text-primary" aria-hidden="true" />
            <span className="font-medium">
              Proyecto restaurado: {notices.restored.records} {notices.restored.records === 1 ? "pieza" : "piezas"} · modificado {timeAgo(notices.restored.modifiedAt)}
            </span>
            <IconButton size="small" aria-label="Ocultar aviso" onClick={dismissRestored}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>
        ) : undefined}
      </Snackbar>

      <QuarantineDialog open={viewing} onClose={() => setViewing(false)} onDownload={actions.downloadQuarantine} onDiscard={() => void actions.discardQuarantine().then((ok) => ok && setViewing(false))} />
    </div>
  );
}
