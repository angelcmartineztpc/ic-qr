"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import EditNoteIcon from "@mui/icons-material/EditNote";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Button from "@mui/material/Button";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useRef, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { countRecords } from "@/lib/state/counters";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";

import { Panel } from "@/components/ui/Panel";

import { PersistenceBanners } from "./PersistenceBanners";
import { useBuilderActions } from "./useBuilderActions";

function Option({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-divider p-4">
      <div className="flex items-center gap-2 text-primary" aria-hidden>
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-base font-semibold">{title}</h3>
        <p className="m-0 text-sm text-muted">{text}</p>
      </div>
      <div className="mt-auto">{action}</div>
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
    <div className="flex flex-col gap-6">
      <PersistenceBanners actions={actions} />

      {hydrated && hasProject ? (
        <Panel title="Retoma tu proyecto" className="border-l-4 !border-l-primary" label="Proyecto actual">
          <div data-testid="continue-card" className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="m-0 text-xl font-semibold">{name || "Proyecto sin nombre"}</p>
              <p className="m-0 text-sm text-muted">
                {counts.total} {counts.total === 1 ? "pieza" : "piezas"} · {counts.withQr} con QR · {counts.needQr} necesitan QR{counts.withErrors > 0 ? ` · ${counts.withErrors} con errores` : ""}
              </p>
            </div>
            <Button component={Link} href={"/editor" as Route} variant="contained" size="large" endIcon={<ArrowForwardIcon />}>
              Continuar
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title={hasProject ? "O empieza otro proyecto" : "Cómo quieres empezar"} description="Las piezas se crean de una en una, desde un Excel o CSV, o abriendo un proyecto guardado.">
        <div className="grid gap-4 md:grid-cols-3">
          <Option
            icon={<EditNoteIcon />}
            title="Crear manualmente"
            text="Área, estación, mesa, sub-grupo, concepto y links. Sin Link del QR, se genera uno nuevo."
            action={
              <Button component={Link} href={"/editor" as Route} variant={hasProject ? "outlined" : "contained"}>
                + Agregar nuevo
              </Button>
            }
          />
          <Option
            icon={<UploadFileIcon />}
            title="Importar Excel o CSV"
            text="Cada fila se convierte en una pieza editable, con resumen de errores y duplicados."
            action={
              <Button component={Link} href={"/import" as Route} variant="outlined" startIcon={<UploadFileIcon />}>
                Importar Excel
              </Button>
            }
          />
          <Option
            icon={<FolderOpenIcon />}
            title="Abrir un proyecto"
            text="Un archivo .qrproj.json guardado antes. Abrirlo no vuelve a generar ningún QR."
            action={
              <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={() => fileInput.current?.click()} disabled={readOnly}>
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
