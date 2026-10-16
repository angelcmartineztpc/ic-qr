import { useMemo, useState } from "react";

import { ResortLinkPicker } from "@/components/qr-produccion/forms/ResortLinkPicker";
import { PersistenceBanners } from "@/components/qr-produccion/records/PersistenceBanners";
import { useBuilderActions } from "@/components/qr-produccion/records/useBuilderActions";
import { Alert, Button, FormControl, FormControlLabel, FormLabel, LinearProgress, Radio, RadioGroup, Switch, TextField } from "@/components/qr-produccion/ui";
import { resultNeedsMapping } from "@/services/qr-produccion/excel/import-pipeline";
import { planImport, planSize, reviewImport } from "@/services/qr-produccion/excel/review";
import { isOwnLink } from "@/services/qr-produccion/links/own-links";
import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";
import type { DuplicateStrategy } from "@/types";

import { ColumnMappingDialog } from "./ColumnMappingDialog";
import { DuplicateKeyDialog } from "./DuplicateKeyDialog";
import { ExcelUploader } from "./ExcelUploader";
import styles from "./ImportScreen.module.css";
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
  const toShorten = current ? new Set([...current.plan.toCreate.map(({ row }) => row.draft.menuUrl), ...current.plan.fixes.map((row) => row.raw["menuUrl"] ?? "")].map((u) => u.trim()).filter((u) => u !== "" && !isOwnLink(u))).size : 0;
  const discarded = current?.plan.discarded.length ?? 0;
  const busy = imp.status === "uploading";
  const mappingOpen = mappingNeeded && imp.status === "review" && (mappingForced || mappingClosedFor !== result);

  return (
    <div className={styles.root}>
      <PersistenceBanners actions={builder} showRestored={false} />
      {readOnly ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita. Puedes revisar el archivo, pero no importar.</Alert> : null}

      {busy ? (
        <div role="status" className={styles.busy}>
          <p>Leyendo el archivo…</p>
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
          <ResortLinkPicker disabled={readOnly || !hydrated} onPick={setDefaultMenu} />
          <TextField
            label="Link del menú para las filas que no lo traen (opcional)"
            helperText="Elige Resort y Servicio arriba: el QR de todas las filas sin link usará el link estable de ese resort. Si tu archivo no trae la columna «Link del menú» o la trae vacía, se usa este link en esas filas."
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
            <Alert
              severity="success"
              data-testid="import-done"
              action={
                <div className={styles.actionsInline}>
                  <Button color="inherit" size="small" onClick={() => void actions.downloadExcel()}>Descargar Excel actualizado</Button>
                  <Button to="/qr-produccion" color="inherit" size="small">Ver las piezas</Button>
                </div>
              }
            >
              Se importaron {imp.outcome.created + imp.outcome.fixes} piezas{imp.outcome.fixes > 0 ? ` (${imp.outcome.fixes} para corregir)` : ""}
              {imp.outcome.discarded > 0 ? ` y no se importaron ${imp.outcome.discarded} duplicadas` : ""}.
              {result.rejected.length - imp.outcome.fixes > 0 ? ` Quedan ${result.rejected.length - imp.outcome.fixes} filas con error en el informe.` : ""}
            </Alert>
          ) : null}

          <ImportSummary result={result} model={current.model} strategy={imp.strategy} decisions={imp.decisions} existing={recordsById} onDecision={(row, decision) => actions.setDecision(row, decision)} />

          {imp.status === "review" ? (
            <section aria-label="Opciones de importación" className={styles.options}>
              <div className={styles.optionGroups}>
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
              <div className={styles.optionRow}>
                <Button size="small" onClick={() => setKeyOpen(true)}>Clave de duplicados…</Button>
                {result.rejected.length > 0 ? (
                  <FormControlLabel control={<Switch checked={imp.includeRejected} onChange={(e) => actions.setIncludeRejected(e.target.checked)} />} label={`Importar también las ${result.rejected.length} filas con error como piezas a corregir`} />
                ) : null}
              </div>
            </section>
          ) : null}

          {imp.status === "review" && toShorten > 0 ? (
            <Alert severity="info" data-testid="shorten-note">
              Al importar, {toShorten === 1 ? "el link del menú se acortará" : `los ${toShorten} links del menú distintos se acortarán`} automáticamente: el QR llevará el link corto, que no cambia aunque cambie el destino. Después podrás descargar el Excel actualizado con esos links cortos.
            </Alert>
          ) : null}

          <div className={styles.footer}>
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
