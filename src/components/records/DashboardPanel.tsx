"use client";

import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { countRecords } from "@/lib/state/counters";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";

import { TemplatePicker } from "@/components/editor/TemplatePicker";

import { PersistenceBanners } from "./PersistenceBanners";
import { useBuilderActions } from "./useBuilderActions";

/** Inicio (spec §36): continuar el proyecto, crear manualmente o importar un Excel. */
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
        <Card variant="outlined" data-testid="continue-card">
          <CardContent className="flex flex-col gap-1">
            <Typography variant="overline" color="text.secondary">Proyecto actual</Typography>
            <Typography variant="h6" component="h2">{name || "Proyecto sin nombre"}</Typography>
            <Typography color="text.secondary">
              {counts.total} {counts.total === 1 ? "pieza" : "piezas"} · {counts.withQr} con QR · {counts.needQr} necesitan QR{counts.withErrors > 0 ? ` · ${counts.withErrors} con errores` : ""}
            </Typography>
          </CardContent>
          <CardActions className="px-4 pb-4">
            <Button component={Link} href="/editor" variant="contained">Continuar</Button>
          </CardActions>
        </Card>
      ) : null}

      <section aria-label="Empezar" className="grid gap-4 md:grid-cols-2">
        <Card variant="outlined">
          <CardContent className="flex flex-col gap-2">
            <Typography variant="h6" component="h2">Crear manualmente</Typography>
            <Typography color="text.secondary">Agrega piezas una a una: área, estación, mesa, sub-grupo, concepto y links. Si no escribes un Link del QR, se genera uno nuevo.</Typography>
          </CardContent>
          <CardActions className="px-4 pb-4">
            <Button component={Link} href="/editor" variant={hasProject ? "outlined" : "contained"}>+ Agregar nuevo</Button>
          </CardActions>
        </Card>
        <Card variant="outlined">
          <CardContent className="flex flex-col gap-2">
            <Typography variant="h6" component="h2">Importar Excel</Typography>
            <Typography color="text.secondary">Sube un archivo .xlsx: cada fila se convierte en una pieza editable, con resumen de errores y duplicados.</Typography>
          </CardContent>
          <CardActions className="px-4 pb-4">
            <Button component={Link} href="/import" variant="outlined">Importar Excel</Button>
          </CardActions>
        </Card>
      </section>

      <section aria-label="Proyecto" className="flex flex-wrap items-center gap-3">
        <TemplatePicker actions={actions} />
        <Button variant="text" startIcon={<FolderOpenIcon />} onClick={() => fileInput.current?.click()} disabled={readOnly}>
          Abrir proyecto…
        </Button>
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
      </section>
    </div>
  );
}
