"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import LinearProgress from "@mui/material/LinearProgress";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useMemo, useState } from "react";

import { resultNeedsMapping } from "@/lib/excel/import-pipeline";
import { planImport, planSize, reviewImport } from "@/lib/excel/review";
import { isOwnLink } from "@/lib/links/own-links";
import { useProject, useSession } from "@/lib/state/StoreProvider";
import type { DuplicateStrategy } from "@/types";

import { ResortLinkPicker } from "@/components/forms/ResortLinkPicker";
import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { Panel } from "@/components/ui/Panel";

import { ColumnMappingDialog } from "./ColumnMappingDialog";
import { DuplicateKeyDialog } from "./DuplicateKeyDialog";
import { ExcelUploader } from "./ExcelUploader";
import { ImportSummary } from "./ImportSummary";
import { useImportActions } from "./useImportActions";

const MAX_ROWS = 5000;

/** Importar Excel (spec §4B): subir, revisar errores y duplicados, confirmar. */
export function ImportScreen() {
  const actions = useImportActions();
  const builder = useBuilderActions();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const imp = useSession((s) => s.import);
  const recordsById = useProject((p) => p.recordsById);
  const duplicateKey = useProject((p) => p.duplicateKey);
  // El diálogo de columnas se abre solo al llegar un resultado que lo necesita; cerrarlo se recuerda para ese resultado.
  const [mappingClosedFor, setMappingClosedFor] = useState<unknown>(null);
  const [mappingForced, setMappingForced] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [defaultMenu, setDefaultMenu] = useState("");

  const result = imp.result;
  const mappingNeeded = result !== null && resultNeedsMapping(result);
  // El plan se recalcula con el proyecto actual: depende de las piezas, la clave de duplicados y las decisiones.
  const current = useMemo(() => {
    if (!result || mappingNeeded) return null;
    const model = reviewImport(result, duplicateKey, imp.mode === "replace" ? [] : Object.values(recordsById));
    return { model, plan: planImport(result, model, { strategy: imp.strategy, decisions: imp.decisions, includeRejected: imp.includeRejected }) };
  }, [result, mappingNeeded, recordsById, duplicateKey, imp.strategy, imp.decisions, imp.mode, imp.includeRejected]);
  const total = current ? planSize(current.plan) : 0;
  // Links del menú distintos que se acortarán al confirmar (los propios, que ya son cortos, no cuentan).
  const toShorten = current
    ? new Set(
        [...current.plan.toCreate.map(({ row }) => row.draft.menuUrl), ...current.plan.fixes.map((row) => row.raw["menuUrl"] ?? "")]
          .map((u) => u.trim())
          .filter((u) => u !== "" && !isOwnLink(u)),
      ).size
    : 0;
  const discarded = current?.plan.discarded.length ?? 0;
  const busy = imp.status === "uploading";
  const mappingOpen = imp.status === "review" && (mappingForced || (mappingNeeded && mappingClosedFor !== result));

  return (
    <div className="flex flex-col gap-6">
      <PersistenceBanners actions={builder} showRestored={false} />
      {readOnly ? (
        <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita. Puedes revisar el archivo, pero no importar.</Alert>
      ) : null}

      {busy ? (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-divider bg-surface p-4">
          <Typography className="font-medium">Leyendo el archivo…</Typography>
          <LinearProgress />
          <div>
            <Button size="small" onClick={() => actions.cancelUpload()}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {imp.status === "error" && imp.error ? (
        <Alert
          severity="error"
          data-testid="import-error"
          action={
            imp.error.canTruncate ? (
              <Button color="inherit" size="small" onClick={() => void actions.importFirstRows(MAX_ROWS)}>
                Importar solo las primeras {MAX_ROWS}
              </Button>
            ) : undefined
          }
        >
          {imp.error.message}
        </Alert>
      ) : null}

      {imp.status === "idle" || imp.status === "error" ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <Panel
            title="1. Sube tu archivo Excel o CSV"
            label="Paso principal"
            description="Arrastra tu hoja .xlsx o .csv. Reconocemos automáticamente Área, Estación, Mesa, Sub-grupo, Concepto y Link del menú."
          >
            <ExcelUploader disabled={readOnly || !hydrated} onFile={(file) => void actions.start(file, defaultMenu)} />
          </Panel>

          <Panel
            title="2. Link de respaldo para filas vacías"
            label="Opcional · Antes de subir"
            description="Solo si tu archivo no incluye la columna «Link del menú» o tiene celdas vacías, asignaremos este enlace por defecto."
            className="bg-background/50"
          >
            <ResortLinkPicker disabled={readOnly || !hydrated} onPick={setDefaultMenu} />
            <TextField
              size="small"
              label="Link del menú para las filas que no lo traen (opcional)"
              helperText="Si tu Excel ya trae los enlaces, puedes ignorar esta sección."
              placeholder="https://menu.ejemplo.com/hotel"
              value={defaultMenu}
              onChange={(e) => setDefaultMenu(e.target.value)}
              type="url"
              slotProps={{ htmlInput: { autoComplete: "off", inputMode: "url" } }}
            />
          </Panel>
        </div>
      ) : null}

      {result && mappingNeeded && imp.status === "review" ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => setMappingForced(true)}>
              Elegir columnas
            </Button>
          }
          data-testid="mapping-needed"
        >
          No pudimos reconocer todas las columnas obligatorias de «{result.fileName}». Elige a qué campo corresponde cada una para continuar.
        </Alert>
      ) : null}

      {result && !mappingNeeded && current && (imp.status === "review" || imp.status === "done") ? (
        <>
          {imp.status === "done" && imp.outcome ? (
            <Alert
              severity="success"
              data-testid="import-done"
              action={
                <div className="flex flex-wrap gap-1.5">
                  <Button color="inherit" size="small" onClick={() => void actions.downloadExcel()}>
                    Descargar Excel actualizado
                  </Button>
                  <Button component={Link} href="/editor" variant="contained" size="small">
                    Ver las piezas
                  </Button>
                </div>
              }
            >
              Se importaron {imp.outcome.created + imp.outcome.fixes} piezas{imp.outcome.fixes > 0 ? ` (${imp.outcome.fixes} para corregir)` : ""}
              {imp.outcome.discarded > 0 ? ` y no se importaron ${imp.outcome.discarded} duplicadas` : ""}.
              {result.rejected.length - imp.outcome.fixes > 0
                ? ` Quedan ${result.rejected.length - imp.outcome.fixes} filas con error en el informe.`
                : ""}
            </Alert>
          ) : null}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <ImportSummary
              result={result}
              model={current.model}
              strategy={imp.strategy}
              decisions={imp.decisions}
              existing={recordsById}
              onDecision={(row, decision) => actions.setDecision(row, decision)}
              onEditMapping={imp.status === "review" ? () => setMappingForced(true) : undefined}
            />

            <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
              {imp.status === "review" ? (
                <section
                  aria-label="Opciones de importación"
                  className="flex flex-col gap-4 rounded-xl border border-divider bg-surface p-4 shadow-xs sm:p-5"
                >
                  <div className="border-b border-divider pb-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Paso final</span>
                    <h2 className="m-0 text-base font-semibold tracking-tight text-foreground">Confirmar importación</h2>
                  </div>

                  <FormControl className="rounded-lg border border-divider bg-background/50 p-3">
                    <FormLabel id="mode-label" className="mb-1 text-xs font-semibold uppercase tracking-wider text-foreground">
                      Qué hacer con las piezas actuales
                    </FormLabel>
                    <RadioGroup
                      aria-labelledby="mode-label"
                      value={imp.mode}
                      onChange={(e) => actions.setMode(e.target.value as "append" | "replace")}
                    >
                      <FormControlLabel value="append" control={<Radio size="small" />} label="Añadir al proyecto" />
                      <FormControlLabel value="replace" control={<Radio size="small" />} label="Reemplazar el proyecto" />
                    </RadioGroup>
                  </FormControl>

                  <div className="flex flex-col gap-2.5 rounded-lg border border-divider bg-background/50 p-3">
                    {current.model.stats.duplicates > 0 ? (
                      <FormControl>
                        <FormLabel id="dup-label" className="mb-1 text-xs font-semibold uppercase tracking-wider text-foreground">
                          Duplicados detectados ({current.model.stats.duplicates})
                        </FormLabel>
                        <RadioGroup
                          aria-labelledby="dup-label"
                          value={imp.strategy}
                          onChange={(e) => actions.setStrategy(e.target.value as DuplicateStrategy)}
                        >
                          <FormControlLabel value="keep" control={<Radio size="small" />} label="Mantener" />
                          <FormControlLabel value="remove" control={<Radio size="small" />} label="Eliminar duplicados" />
                          <FormControlLabel value="review" control={<Radio size="small" />} label="Revisar manualmente" />
                        </RadioGroup>
                      </FormControl>
                    ) : (
                      <span className="text-xs font-medium text-muted">✓ Sin filas duplicadas según la clave actual</span>
                    )}
                    <div>
                      <Button size="small" variant="outlined" onClick={() => setKeyOpen(true)}>
                        Clave de duplicados…
                      </Button>
                    </div>
                  </div>

                  {result.rejected.length > 0 ? (
                    <div className="rounded-lg border border-divider bg-background/50 p-3">
                      <FormControlLabel
                        control={<Switch checked={imp.includeRejected} onChange={(e) => actions.setIncludeRejected(e.target.checked)} />}
                        label={`Importar también las ${result.rejected.length} filas con error como piezas a corregir`}
                      />
                    </div>
                  ) : null}

                  {toShorten > 0 ? (
                    <Alert severity="info" data-testid="shorten-note" className="text-xs">
                      Al importar, {toShorten === 1 ? "el link del menú se acortará" : `los ${toShorten} links del menú distintos se acortarán`} automáticamente:
                      el QR llevará el link corto, que no cambia aunque cambie el destino. Después podrás descargar el Excel actualizado con esos links cortos.
                    </Alert>
                  ) : null}

                  <div className="flex flex-col gap-2 border-t border-divider pt-3">
                    <Button
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={readOnly || total === 0}
                      onClick={() => void actions.confirm()}
                      data-testid="confirm-import"
                    >
                      {discarded > 0 ? `Importar ${total} · descartar ${discarded}` : `Importar ${total} ${total === 1 ? "pieza" : "piezas"}`}
                    </Button>
                    {result.rejected.length > 0 || discarded > 0 ? (
                      <Button variant="outlined" size="small" fullWidth onClick={() => actions.downloadErrorReport()}>
                        Descargar informe de errores (.csv)
                      </Button>
                    ) : null}
                    <Button color="inherit" size="small" fullWidth onClick={() => void actions.discardResult()}>
                      Descartar y elegir otro archivo
                    </Button>
                  </div>
                </section>
              ) : (
                <div className="flex flex-col gap-2 rounded-xl border border-divider bg-surface p-4 shadow-xs">
                  {result.rejected.length > 0 || discarded > 0 || (imp.outcome?.discarded ?? 0) > 0 ? (
                    <Button variant="outlined" fullWidth onClick={() => actions.downloadErrorReport()}>
                      Descargar informe de errores (.csv)
                    </Button>
                  ) : null}
                  <Button color="inherit" fullWidth onClick={() => void actions.discardResult()}>
                    Cerrar este resultado
                  </Button>
                </div>
              )}
            </aside>
          </div>
        </>
      ) : null}

      {result ? (
        <ColumnMappingDialog
          open={mappingOpen}
          mapping={result.mapping}
          onClose={() => {
            setMappingForced(false);
            setMappingClosedFor(result);
          }}
          onApply={(columns) => {
            setMappingForced(false);
            void actions.applyColumnMapping(columns);
          }}
        />
      ) : null}
      <DuplicateKeyDialog open={keyOpen} value={duplicateKey} onClose={() => setKeyOpen(false)} onSave={(config) => actions.changeDuplicateKey(config)} />
    </div>
  );
}
