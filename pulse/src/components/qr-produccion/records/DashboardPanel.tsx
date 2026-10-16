import { ArrowRight, FileUp, FolderOpen, SquarePen } from "lucide-react";
import { useMemo, useRef, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { Panel } from "@/components/qr-produccion/layout/Panel";
import { Button } from "@/components/qr-produccion/ui";
import { countRecords } from "@/services/qr-produccion/state/counters";
import { orderedRecords } from "@/services/qr-produccion/state/project";
import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";

import styles from "./DashboardPanel.module.css";
import { PersistenceBanners } from "./PersistenceBanners";
import { useBuilderActions } from "./useBuilderActions";

function Option({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: ReactNode }) {
  return (
    <div className={styles.option}>
      <div className={styles.optionIcon} aria-hidden>
        {icon}
      </div>
      <div className={styles.optionText}>
        <h3 className={styles.optionTitle}>{title}</h3>
        <p className={styles.optionBody}>{text}</p>
      </div>
      <div className={styles.optionAction}>{action}</div>
    </div>
  );
}

/** Inicio: retomar el proyecto abierto o empezar uno nuevo. Nada más; el resto del flujo vive en los tres pasos. */
export function DashboardPanel() {
  const actions = useBuilderActions();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const name = useProject((p) => p.name);
  const counts = useMemo(() => countRecords(records), [records]);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasProject = records.length > 0;

  return (
    <div className={styles.root}>
      <PersistenceBanners actions={actions} />

      {hydrated && hasProject ? (
        <Panel title="Retoma tu proyecto" className={styles.continue} label="Proyecto actual">
          <div data-testid="continue-card" className={styles.continueBody}>
            <div className={styles.continueText}>
              <p className={styles.projectName}>{name || "Proyecto sin nombre"}</p>
              <p className={styles.projectMeta}>
                {counts.total} {counts.total === 1 ? "pieza" : "piezas"} · {counts.withQr} con QR · {counts.needQr} necesitan QR{counts.withErrors > 0 ? ` · ${counts.withErrors} con errores` : ""}
              </p>
            </div>
            <Button to="/qr-produccion" variant="contained" size="large" endIcon={<ArrowRight size={18} />}>
              Continuar
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title={hasProject ? "O empieza otro proyecto" : "Cómo quieres empezar"} description="Las piezas se crean de una en una, desde un Excel o CSV, o abriendo un proyecto guardado.">
        <div className={styles.options}>
          <Option
            icon={<SquarePen size={24} />}
            title="Crear manualmente"
            text="Área, estación, mesa, sub-grupo, concepto y links. Sin Link del QR, se genera uno nuevo."
            action={
              <Button to="/qr-produccion" variant={hasProject ? "outlined" : "contained"}>
                + Agregar nuevo
              </Button>
            }
          />
          <Option
            icon={<FileUp size={24} />}
            title="Importar Excel o CSV"
            text="Cada fila se convierte en una pieza editable, con resumen de errores y duplicados."
            action={
              <Button to="/qr-produccion/importar" variant="outlined" startIcon={<FileUp size={18} />}>
                Importar Excel
              </Button>
            }
          />
          <Option
            icon={<FolderOpen size={24} />}
            title="Abrir un proyecto"
            text="Un archivo .qrproj.json guardado antes. Abrirlo no vuelve a generar ningún QR."
            action={
              <Button variant="outlined" startIcon={<FolderOpen size={18} />} onClick={() => fileInput.current?.click()} disabled={readOnly}>
                Abrir proyecto…
              </Button>
            }
          />
        </div>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".qrproj.json,.json,application/json"
          data-testid="open-project-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void actions.openProjectFromFile(file);
          }}
        />
      </Panel>
    </div>
  );
}
