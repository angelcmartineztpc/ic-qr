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
import { useProject, useSession } from "@/lib/state/StoreProvider";
import type { DuplicateStrategy } from "@/types";

import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";

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
  const discarded = current?.plan.discarded.length ?? 0;
  const busy = imp.status === "uploading";
  const mappingOpen = mappingNeeded && imp.status === "review" && (mappingForced || mappingClosedFor !== result);

  return (
    <div className="flex flex-col gap-6">
      <PersistenceBanners actions={builder} showRestored={false} />
      {readOnly ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita. Puedes revisar el archivo, pero no importar.</Alert> : null}

      {busy ? (
        <div role="status" className="flex flex-col gap-2">
          <Typography>Leyendo el archivo…</Typography>
          <LinearProgress />
          <div><Button size="small" onClick={() => actions.cancelUpload()}>Cancelar</Button></div>
        </div>
      ) : null}

      {imp.status === "error" && imp.error ? (
        <Alert
          severity="error"
          data-testid="import-error"
          action={imp.error.canTruncate ? <Button color="inherit" size="small" onClick={() => void actions.importFirstRows(MAX_ROWS)}>Importar solo las primeras {MAX_ROWS}</Button> : undefined}
        >
          {imp.error.message}
        </Alert>
      ) : null}

      {imp.status === "idle" || imp.status === "error" ? (
        <>
          <TextField
            label="Link del menú para las filas que no lo traen (opcional)"
            helperText="Si tu archivo no tiene la columna «Link del menú» o la trae vacía, se usa este link en esas filas."
            placeholder="https://menu.ejemplo.com/hotel"
            value={defaultMenu}
            onChange={(e) => setDefaultMenu(e.target.value)}
            type="url"
            slotProps={{ htmlInput: { autoComplete: "off", inputMode: "url" } }}
          />
          <ExcelUploader disabled={readOnly || !hydrated} onFile={(file) => void actions.start(file, defaultMenu)} />
        </>
      ) : null}

      {result && mappingNeeded && imp.status === "review" ? (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setMappingForced(true)}>Elegir columnas</Button>} data-testid="mapping-needed">
          No pudimos reconocer todas las columnas obligatorias de «{result.fileName}». Elige a qué campo corresponde cada una para continuar.
        </Alert>
      ) : null}

      {result && !mappingNeeded && current && (imp.status === "review" || imp.status === "done") ? (
        <>
          {imp.status === "done" && imp.outcome ? (
            <Alert severity="success" data-testid="import-done" action={<Button component={Link} href="/editor" color="inherit" size="small">Ver las piezas</Button>}>
              Se importaron {imp.outcome.created + imp.outcome.fixes} piezas{imp.outcome.fixes > 0 ? ` (${imp.outcome.fixes} para corregir)` : ""}
              {imp.outcome.discarded > 0 ? ` y no se importaron ${imp.outcome.discarded} duplicadas` : ""}.
              {result.rejected.length - imp.outcome.fixes > 0 ? ` Quedan ${result.rejected.length - imp.outcome.fixes} filas con error en el informe.` : ""}
            </Alert>
          ) : null}

          <ImportSummary result={result} model={current.model} strategy={imp.strategy} decisions={imp.decisions} existing={recordsById} onDecision={(row, decision) => actions.setDecision(row, decision)} />

          {imp.status === "review" ? (
            <section aria-label="Opciones de importación" className="flex flex-col gap-4 rounded-lg border border-divider p-4">
              <div className="flex flex-wrap gap-6">
                <FormControl>
                  <FormLabel id="mode-label">Qué hacer con las piezas actuales</FormLabel>
                  <RadioGroup row aria-labelledby="mode-label" value={imp.mode} onChange={(e) => actions.setMode(e.target.value as "append" | "replace")}>
                    <FormControlLabel value="append" control={<Radio />} label="Añadir al proyecto" />
                    <FormControlLabel value="replace" control={<Radio />} label="Reemplazar el proyecto" />
                  </RadioGroup>
                </FormControl>
                <FormControl disabled={current.model.stats.duplicates === 0}>
                  <FormLabel id="dup-label">Duplicados</FormLabel>
                  <RadioGroup row aria-labelledby="dup-label" value={imp.strategy} onChange={(e) => actions.setStrategy(e.target.value as DuplicateStrategy)}>
                    <FormControlLabel value="keep" control={<Radio />} label="Mantener" />
                    <FormControlLabel value="remove" control={<Radio />} label="Eliminar duplicados" />
                    <FormControlLabel value="review" control={<Radio />} label="Revisar manualmente" />
                  </RadioGroup>
                </FormControl>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="small" onClick={() => setKeyOpen(true)}>Clave de duplicados…</Button>
                {result.rejected.length > 0 ? (
                  <FormControlLabel control={<Switch checked={imp.includeRejected} onChange={(e) => actions.setIncludeRejected(e.target.checked)} />} label={`Importar también las ${result.rejected.length} filas con error como piezas a corregir`} />
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {imp.status === "review" ? (
              <Button variant="contained" size="large" disabled={readOnly || total === 0} onClick={() => void actions.confirm()} data-testid="confirm-import">
                {discarded > 0 ? `Importar ${total} · descartar ${discarded}` : `Importar ${total} ${total === 1 ? "pieza" : "piezas"}`}
              </Button>
            ) : null}
            {result.rejected.length > 0 || discarded > 0 || (imp.outcome?.discarded ?? 0) > 0 ? (
              <Button variant="outlined" onClick={() => actions.downloadErrorReport()}>Descargar informe de errores (.csv)</Button>
            ) : null}
            <Button color="inherit" onClick={() => void actions.discardResult()}>{imp.status === "done" ? "Cerrar este resultado" : "Descartar y elegir otro archivo"}</Button>
          </div>
        </>
      ) : null}

      {result ? <ColumnMappingDialog open={mappingOpen} mapping={result.mapping} onClose={() => { setMappingForced(false); setMappingClosedFor(result); }} onApply={(columns) => { setMappingForced(false); void actions.applyColumnMapping(columns); }} /> : null}
      <DuplicateKeyDialog open={keyOpen} value={duplicateKey} onClose={() => setKeyOpen(false)} onSave={(config) => actions.changeDuplicateKey(config)} />
    </div>
  );
}
