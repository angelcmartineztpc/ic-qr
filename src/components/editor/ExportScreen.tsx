"use client";

import DownloadIcon from "@mui/icons-material/Download";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { blockingStyleWarnings } from "@/components/qr-style/qr-style-model";
import { describeLayoutWarning } from "@/lib/errors/messages.es";
import { resolveQrDecision } from "@/lib/records/qr-state";
import { resolveTemplate } from "@/lib/template/resolve";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";
import { isGenerating } from "@/lib/state/stores";
import { getTemplate } from "@/templates";

import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { StepFooter } from "@/components/ui/StepFooter";

import { DownloadProgress } from "./DownloadProgress";
import { ExportBlockersDialog } from "./ExportBlockersDialog";
import { FileNameInput } from "./FileNameInput";
import { GenerationStatus } from "./GenerationStatus";
import { PdfViewer } from "./PdfViewer";
import { PdfOptionsPanel } from "./PdfOptionsPanel";
import { useEditorActions } from "./useEditorActions";
import { useExportActions } from "./useExportActions";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Paso 3: resumen de lo que se exporta, nombre y opciones de la hoja, vista de las hojas y descarga. */
export function ExportScreen() {
  const builder = useBuilderActions();
  const editor = useEditorActions();
  const exporter = useExportActions();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const generation = useSession((s) => s.generation);
  const excluded = useSession(useShallow((s) => s.excluded));
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const templateId = useProject((p) => p.templateId);
  const exportOptions = useProject((p) => p.exportOptions);
  const templateOverrides = useProject((p) => p.templateOverrides);
  const template = getTemplate(templateId);

  if (!hydrated) return <p role="status">Cargando…</p>;
  if (!template) return <Alert severity="error">La plantilla «{templateId}» ya no existe. Elígela de nuevo en el paso Diseño.</Alert>;
  if (records.length === 0) {
    return (
      <EmptyState.Root aria-label="Sin piezas">
        <EmptyState.Header>
          <EmptyState.Title>Aún no hay piezas que exportar</EmptyState.Title>
          <EmptyState.Description>Crea o importa piezas en el primer paso antes de preparar los pliegos de impresión.</EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.PrimaryAction>
          <Button component={Link} href="/editor" variant="contained">
            Ir a las piezas
          </Button>
        </EmptyState.PrimaryAction>
      </EmptyState.Root>
    );
  }

  const included = records.filter((r) => !excluded.includes(r.id));
  const blocked = included.filter((r) => r.qrError !== undefined || r.validationErrors.some((i) => i.severity === "error")).length;
  const needQr = included.filter((r) => r.qrError === undefined && ["generate", "check-existing"].includes(resolveQrDecision(r))).length;
  const generating = isGenerating(generation);
  const disabled = readOnly;
  // Un estilo que deja el QR ilegible (contraste casi nulo, logo demasiado grande) no se fabrica.
  const resolvedTemplate = resolveTemplate(template, templateOverrides);
  const styleBlockers = blockingStyleWarnings(templateOverrides.qrStyle, resolvedTemplate.success ? resolvedTemplate.data.qr : template.qr, included);

  return (
    <div className="flex flex-col gap-6">
      <PersistenceBanners actions={builder} showRestored={false} />
      {readOnly ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}
      {styleBlockers.length > 0 ? (
        <Alert severity="error" role="alert" data-testid="style-blocker" action={<Button color="inherit" size="small" component={Link} href="/style">Corregir estilo</Button>}>
          <ul className="m-0 list-none p-0">
            {styleBlockers.map((warning, i) => <li key={i}>{describeLayoutWarning(warning)}</li>)}
          </ul>
        </Alert>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,26.5rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Panel title="1. Resumen del lote y archivo" description={`Plantilla «${template.name}» · Mesa de ${template.tile.width} × ${template.tile.height} mm`}>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-divider bg-surface-subtle p-3 text-sm" data-testid="export-summary">
              <dt className="text-muted">Piezas</dt>
              <dd className="m-0 font-medium tabular-nums">{plural(included.length, "pieza", "piezas")}</dd>
              <dt className="text-muted">QR por generar</dt>
              <dd className="m-0 font-medium">{needQr === 0 ? "Todos listos" : `${needQr} (se generan al descargar)`}</dd>
              {blocked > 0 ? (
                <>
                  <dt className="text-muted">Con errores</dt>
                  <dd className="m-0 font-medium text-warning">
                    {blocked} · <Link href="/editor">revisar</Link>
                  </dd>
                </>
              ) : null}
            </dl>
            {excluded.length > 0 ? (
              <Alert
                severity="info"
                data-testid="excluded-note"
                action={
                  <Button color="inherit" size="small" onClick={() => exporter.includeAll()} disabled={generating}>
                    Volver a incluirlas
                  </Button>
                }
              >
                {plural(excluded.length, "pieza excluida", "piezas excluidas")} de esta exportación.
              </Alert>
            ) : null}
            <div className="border-t border-divider pt-3">
              <FileNameInput value={exportOptions.fileName} disabled={disabled} onChange={(name) => editor.setFileName(name)} />
            </div>
          </Panel>

          <Panel title="2. Hoja e imposición del pliego">
            <PdfOptionsPanel
              options={exportOptions.pdf}
              tile={template.tile}
              count={included.length}
              disabled={disabled}
              onChange={(patch) => editor.setPdfOptions(patch)}
              formats={exportOptions.formats}
              zipNaming={exportOptions.zipNaming}
              onFormats={(formats, naming) => editor.setFormats(formats, naming)}
              pdfBySection={exportOptions.pdfBySection}
              onPdfBySection={(v) => editor.setPdfBySection(v)}
            />
          </Panel>
        </div>

        <Panel
          title="Vista previa del pliego PDF"
          description="Representación exacta de las hojas de producción y la imposición de cada placa vectorial."
          className="self-start rounded-t-2xl rounded-b-xl lg:sticky lg:top-6"
          label="Hojas del PDF"
        >
          <PdfViewer tile={template.tile} options={exportOptions.pdf} records={included} />
          {generation.phase === "done" && generation.result ? (
            <Alert
              severity={generation.result.warnings > 0 ? "warning" : "success"}
              data-testid="last-export"
              action={
                generation.result.zip ? (
                  <Button color="inherit" size="small" onClick={() => exporter.downloadZip()}>
                    Descargar ZIP
                  </Button>
                ) : undefined
              }
            >
              Última exportación: {plural(generation.result.pieces, "pieza", "piezas")} en {plural(generation.result.pages, "página", "páginas")}
              {generation.result.warnings > 0 ? `, con ${plural(generation.result.warnings, "aviso", "avisos")} de composición` : ""}.
            </Alert>
          ) : null}
        </Panel>
      </div>

      <StepFooter
        back={{ href: "/preview", label: "Diseño" }}
        primary={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <GenerationStatus />
            <Button
              variant="contained"
              size="large"
              startIcon={<DownloadIcon />}
              disabled={disabled || generating || included.length === 0 || styleBlockers.length > 0}
              onClick={() => void exporter.start()}
              data-testid="download-pdf"
              className="!rounded-full !px-5"
            >
              {exportOptions.formats.includes("pdf") ? "Descargar PDF" : "Descargar ZIP de SVG"}
            </Button>
          </div>
        }
      />
      <DownloadProgress actions={exporter} />
      <ExportBlockersDialog actions={exporter} />
    </div>
  );
}
