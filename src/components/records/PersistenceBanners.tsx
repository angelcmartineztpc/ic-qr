"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

import { timeAgo } from "@/lib/format";
import { useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession } from "@/lib/state/stores";

import type { BuilderActions } from "./builder-actions";

/** Avisos permanentes sobre el guardado local y la pestaña escritora (§S6). Nada silencioso. */
export function PersistenceBanners({ actions }: { actions: BuilderActions }) {
  const runtime = useRuntime();
  const writer = useSession((s) => s.writer);
  const status = useSession((s) => s.persistence.status);
  const notices = useSession((s) => s.notices);
  const hydrated = useSession((s) => s.hydrated);
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
        <Alert severity="error" onClose={() => patchSession(runtime.session, (s) => ({ notices: { ...s.notices, recoveredBackup: null } }))}>
          No se pudo leer el proyecto guardado en este navegador. Se conservó una copia de seguridad (<code>{notices.recoveredBackup}</code>) y se empezó un proyecto vacío.
        </Alert>
      ) : null}
      {notices.quarantined > 0 ? (
        <Alert severity="warning" onClose={() => patchSession(runtime.session, (s) => ({ notices: { ...s.notices, quarantined: 0 } }))}>
          {notices.quarantined === 1 ? "1 registro no se pudo leer" : `${notices.quarantined} registros no se pudieron leer`} y se apartó en cuarentena; el resto del proyecto está intacto.
        </Alert>
      ) : null}
      {notices.restored ? (
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
    </div>
  );
}
