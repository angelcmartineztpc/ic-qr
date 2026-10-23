"use client";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ContactMailOutlinedIcon from "@mui/icons-material/ContactMailOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import LinkIcon from "@mui/icons-material/Link";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import WifiIcon from "@mui/icons-material/Wifi";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useMemo, useState } from "react";

import { ColorField } from "@/components/qr-style/ColorField";
import { LogoControls } from "@/components/qr-style/LogoControls";
import { ShapePicker, type ShapeOption } from "@/components/qr-style/ShapePicker";
import { EyeBallSwatch, EyeFrameSwatch, ModuleSwatch, OutlineSwatch } from "@/components/qr-style/swatches";
import { Panel } from "@/components/ui/Panel";
import { postJson } from "@/lib/app/api-client";
import { describeLayoutWarning } from "@/lib/errors/messages.es";
import { qrStyleWarnings, resolveStyleColors, styledQrNodes } from "@/lib/qr-style";
import { renderSceneSvg } from "@/lib/svg/render-scene";
import { DEFAULT_QR_STYLE, type QrStyle } from "@/schemas/qr-style";
import type { HexColor } from "@/types";

import {
  buildPayloadString,
  DEFAULT_UNIVERSAL_DATA,
  safeMatrixOf,
  type QrPayloadType,
  type UniversalQrData,
} from "./payload-builders";

const OUTLINES: ShapeOption<QrStyle["outline"]>[] = [
  { value: "square", label: "Cuadrado", icon: <OutlineSwatch shape="square" /> },
  { value: "circle", label: "Círculo", icon: <OutlineSwatch shape="circle" /> },
];
const MODULES: ShapeOption<QrStyle["modules"]>[] = [
  { value: "square", label: "Cuadrado", icon: <ModuleSwatch shape="square" /> },
  { value: "rounded", label: "Redondeado", icon: <ModuleSwatch shape="rounded" /> },
  { value: "extra-rounded", label: "Muy redondeado", icon: <ModuleSwatch shape="extra-rounded" /> },
  { value: "dots", label: "Puntos", icon: <ModuleSwatch shape="dots" /> },
  { value: "classy", label: "Hoja", icon: <ModuleSwatch shape="classy" /> },
  { value: "classy-rounded", label: "Hoja suave", icon: <ModuleSwatch shape="classy-rounded" /> },
];
const EYE_NAMES = { square: "Cuadrado", rounded: "Redondeado", circle: "Círculo" } as const;
const EYE_FRAMES: ShapeOption<QrStyle["eyeFrame"]>[] = (["square", "rounded", "circle"] as const).map((value) => ({
  value,
  label: EYE_NAMES[value],
  icon: <EyeFrameSwatch shape={value} />,
}));
const EYE_BALLS: ShapeOption<QrStyle["eyeBall"]>[] = (["square", "rounded", "circle"] as const).map((value) => ({
  value,
  label: EYE_NAMES[value],
  icon: <EyeBallSwatch shape={value} />,
}));

const PREVIEW_MM = 50;

const PAYLOAD_TYPES: { id: QrPayloadType; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "url", label: "Página Web", hint: "Menú, sitio o documento", icon: <LinkIcon fontSize="small" /> },
  { id: "wifi", label: "Red Wi-Fi", hint: "Conectar sin escribir clave", icon: <WifiIcon fontSize="small" /> },
  { id: "whatsapp", label: "WhatsApp", hint: "Iniciar chat directo", icon: <WhatsAppIcon fontSize="small" /> },
  { id: "vcard", label: "Contacto", hint: "Guardar número en agenda", icon: <ContactMailOutlinedIcon fontSize="small" /> },
  { id: "email", label: "Correo", hint: "Enviar un mensaje rápido", icon: <EmailOutlinedIcon fontSize="small" /> },
  { id: "text", label: "Texto Libre", hint: "Nota, clave o referencia", icon: <NotesOutlinedIcon fontSize="small" /> },
];

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function UniversalGeneratorScreen() {
  const [data, setData] = useState<UniversalQrData>(DEFAULT_UNIVERSAL_DATA);
  const [style, setStyle] = useState<QrStyle>(DEFAULT_QR_STYLE);
  const [showGuide, setShowGuide] = useState(true);

  const payload = useMemo(() => buildPayloadString(data), [data]);
  const matrix = useMemo(() => safeMatrixOf(payload), [payload]);

  const baseColors = { dark: "#000000" as HexColor, light: "#FFFFFF" as HexColor };
  const colors = useMemo(() => resolveStyleColors(style, baseColors), [style]);
  const warnings = useMemo(() => qrStyleWarnings(style, colors, matrix.length), [style, colors, matrix.length]);

  const updateStyle = (patch: Partial<QrStyle>) => setStyle((prev) => ({ ...prev, ...patch }));
  const updateColors = (patch: Partial<QrStyle["colors"]>) =>
    setStyle((prev) => ({ ...prev, colors: { ...prev.colors, ...patch } }));

  const sceneSvg = useMemo(() => {
    const { nodes } = styledQrNodes({
      box: { x: 0, y: 0, width: PREVIEW_MM },
      matrix,
      quietZoneModules: 4,
      style,
      base: baseColors,
      includeBackground: true,
    });
    return renderSceneSvg(
      {
        widthMm: PREVIEW_MM,
        heightMm: PREVIEW_MM,
        nodes,
        warnings: [],
        meta: { recordId: "universal-qr", templateId: "Universal", templateVersion: "1.0" },
      },
      { title: "Vista previa del QR con el estilo elegido" },
    );
  }, [matrix, style]);

  const handleDownloadSvg = () => {
    const blob = new Blob([sceneSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${data.type}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    // Se archiva igual que los QR de producción; si falla, la descarga ya se hizo.
    void postJson("/api/qr/universal", { svg: sceneSvg, kind: data.type }).catch(() => undefined);
  };

  const customized = JSON.stringify(style) !== JSON.stringify(DEFAULT_QR_STYLE);

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* GUÍA RÁPIDA DE USO (SIMPLE Y ACCESIBLE) */}
      {showGuide ? (
        <section
          aria-label="Guía rápida de uso"
          className="rounded-t-[28px] rounded-b-xl border border-divider bg-surface p-4 sm:p-5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-divider">
            <div className="flex items-center gap-2">
              <HelpOutlineIcon color="primary" fontSize="small" />
              <h2 className="m-0 text-sm font-bold text-foreground">¿Cómo funciona? Crea tu QR en 3 pasos sencillos</h2>
            </div>
            <Button
              size="small"
              variant="text"
              color="inherit"
              onClick={() => setShowGuide(false)}
              className="!rounded-full !text-xs !text-muted hover:!text-foreground"
            >
              Ocultar guía
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                1
              </span>
              <div>
                <p className="m-0 text-sm font-bold text-foreground">Elige qué abrirá el QR</p>
                <p className="m-0 mt-0.5 text-xs text-muted leading-relaxed">
                  Selecciona si quieres llevar a una página web, compartir el Wi-Fi, abrir un chat de WhatsApp o guardar un contacto.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                2
              </span>
              <div>
                <p className="m-0 text-sm font-bold text-foreground">Personaliza estilo, color y logo</p>
                <p className="m-0 mt-0.5 text-xs text-muted leading-relaxed">
                  Ajusta la geometría de las esquinas, los colores y el isotipo central igual que en el resto de tus piezas.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                3
              </span>
              <div>
                <p className="m-0 text-sm font-bold text-foreground">Descárgalo al instante</p>
                <p className="m-0 mt-0.5 text-xs text-muted leading-relaxed">
                  Bájalo como <strong>Vector (SVG)</strong>: líneas vectoriales listas para imprenta, grabado o Illustrator.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="flex justify-end">
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<HelpOutlineIcon fontSize="small" />}
            onClick={() => setShowGuide(true)}
            className="!rounded-full !border-divider !bg-surface !text-xs"
          >
            Ver guía rápida de uso
          </Button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        {/* COLUMNA IZQUIERDA: CONTENIDO Y PERSONALIZACIÓN (MISMA ESTRUCTURA QUE QR STYLE) */}
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          {/* PASO 1: ¿QUÉ QUIERES COMPARTIR? */}
          <Panel
            title="1. ¿Qué quieres compartir?"
            description="Selecciona una opción y escribe la información abajo. El código QR se actualiza solo mientras escribes."
          >
            <div
              role="radiogroup"
              aria-label="Tipo de código QR"
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
            >
              {PAYLOAD_TYPES.map((item) => {
                const selected = data.type === item.id;
                return (
                  <ButtonBase
                    key={item.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setData((prev) => ({ ...prev, type: item.id }))}
                    className={`!flex !min-h-[5.5rem] !flex-col !items-start !justify-between !gap-2 !rounded-xl !border !p-3.5 !text-left transition-colors ${
                      selected
                        ? "!border-primary !bg-primary/10"
                        : "!border-divider hover:!bg-surface-subtle"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        selected ? "bg-primary text-white" : "bg-surface-subtle text-foreground"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div>
                      <span className="block text-sm font-bold text-foreground">{item.label}</span>
                      <span className="block text-xs text-muted leading-snug">{item.hint}</span>
                    </div>
                  </ButtonBase>
                );
              })}
            </div>

            <div className="mt-2 flex flex-col gap-3 border-t border-divider pt-4">
              {data.type === "url" ? (
                <TextField
                  label="Dirección de la página web (Link)"
                  placeholder="https://ejemplo.com/menu"
                  value={data.url}
                  onChange={(e) => setData((prev) => ({ ...prev, url: e.target.value }))}
                  type="url"
                  fullWidth
                  size="small"
                  helperText="Pega aquí el link de tu menú, página o documento."
                />
              ) : null}

              {data.type === "wifi" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Nombre de la red Wi-Fi"
                    placeholder="Ej. Invitados_Hotel"
                    value={data.wifi.ssid}
                    onChange={(e) => setData((prev) => ({ ...prev, wifi: { ...prev.wifi, ssid: e.target.value } }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    select
                    label="¿Tiene contraseña?"
                    value={data.wifi.encryption}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        wifi: { ...prev.wifi, encryption: e.target.value as "WPA" | "WEP" | "nopass" },
                      }))
                    }
                    size="small"
                    fullWidth
                  >
                    <MenuItem value="WPA">Sí (Normal WPA/WPA2)</MenuItem>
                    <MenuItem value="nopass">No, es red abierta</MenuItem>
                    <MenuItem value="WEP">Sí (Antigua WEP)</MenuItem>
                  </TextField>
                  {data.wifi.encryption !== "nopass" ? (
                    <TextField
                      label="Contraseña del Wi-Fi"
                      type="text"
                      placeholder="Escribe la contraseña exacta"
                      value={data.wifi.password}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, wifi: { ...prev.wifi, password: e.target.value } }))
                      }
                      size="small"
                      fullWidth
                      className="sm:col-span-2"
                    />
                  ) : null}
                  <div className="sm:col-span-2">
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={data.wifi.hidden}
                          onChange={(e) =>
                            setData((prev) => ({ ...prev, wifi: { ...prev.wifi, hidden: e.target.checked } }))
                          }
                        />
                      }
                      label={<span className="text-sm text-foreground">Es una red Wi-Fi oculta</span>}
                    />
                  </div>
                </div>
              ) : null}

              {data.type === "vcard" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Nombre"
                    value={data.vcard.firstName}
                    onChange={(e) => setData((prev) => ({ ...prev, vcard: { ...prev.vcard, firstName: e.target.value } }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Apellido"
                    value={data.vcard.lastName}
                    onChange={(e) => setData((prev) => ({ ...prev, vcard: { ...prev.vcard, lastName: e.target.value } }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Teléfono o celular"
                    value={data.vcard.phone}
                    onChange={(e) => setData((prev) => ({ ...prev, vcard: { ...prev.vcard, phone: e.target.value } }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Correo electrónico"
                    value={data.vcard.email}
                    onChange={(e) => setData((prev) => ({ ...prev, vcard: { ...prev.vcard, email: e.target.value } }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Empresa o lugar"
                    value={data.vcard.organization}
                    onChange={(e) =>
                      setData((prev) => ({ ...prev, vcard: { ...prev.vcard, organization: e.target.value } }))
                    }
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Puesto o área"
                    value={data.vcard.title}
                    onChange={(e) => setData((prev) => ({ ...prev, vcard: { ...prev.vcard, title: e.target.value } }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Página web (opcional)"
                    value={data.vcard.website}
                    onChange={(e) => setData((prev) => ({ ...prev, vcard: { ...prev.vcard, website: e.target.value } }))}
                    size="small"
                    fullWidth
                    className="sm:col-span-2"
                  />
                </div>
              ) : null}

              {data.type === "whatsapp" ? (
                <div className="flex flex-col gap-3">
                  <TextField
                    label="Número de WhatsApp (con código de país)"
                    placeholder="Ej. 5215512345678"
                    value={data.whatsapp.phone}
                    onChange={(e) =>
                      setData((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, phone: e.target.value } }))
                    }
                    size="small"
                    fullWidth
                    helperText="Pon el código de país al inicio sin el signo + (ejemplo: 52 para México)."
                  />
                  <TextField
                    label="Mensaje listo para enviar (opcional)"
                    placeholder="Hola, me gustaría pedir información..."
                    value={data.whatsapp.message}
                    onChange={(e) =>
                      setData((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, message: e.target.value } }))
                    }
                    size="small"
                    multiline
                    rows={2}
                    fullWidth
                  />
                </div>
              ) : null}

              {data.type === "email" ? (
                <div className="flex flex-col gap-3">
                  <TextField
                    label="Correo que recibirá el mensaje"
                    placeholder="contacto@ejemplo.com"
                    value={data.email.to}
                    onChange={(e) => setData((prev) => ({ ...prev, email: { ...prev.email, to: e.target.value } }))}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Asunto del correo"
                    value={data.email.subject}
                    onChange={(e) =>
                      setData((prev) => ({ ...prev, email: { ...prev.email, subject: e.target.value } }))
                    }
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Mensaje escrito por defecto"
                    value={data.email.body}
                    onChange={(e) => setData((prev) => ({ ...prev, email: { ...prev.email, body: e.target.value } }))}
                    size="small"
                    multiline
                    rows={2}
                    fullWidth
                  />
                </div>
              ) : null}

              {data.type === "text" ? (
                <TextField
                  label="Escribe el texto o nota"
                  value={data.text}
                  onChange={(e) => setData((prev) => ({ ...prev, text: e.target.value }))}
                  size="small"
                  multiline
                  rows={3}
                  fullWidth
                />
              ) : null}
            </div>
          </Panel>

          {/* PASO 2: GEOMETRÍA Y ESQUINAS (IGUAL QUE EN ESTILO QR DEL PROYECTO) */}
          <Panel
            title="2. Geometría y esquinas"
            description="Elige el contorno general, el trazo de los módulos y el estilo de los tres cuadros localizadores."
            actions={
              customized ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RestartAltIcon fontSize="small" />}
                  onClick={() => setStyle(structuredClone(DEFAULT_QR_STYLE))}
                  className="!rounded-full !px-3.5"
                >
                  Restablecer al QR clásico
                </Button>
              ) : undefined
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Contorno</span>
                <ShapePicker
                  label="Contorno del QR"
                  value={style.outline}
                  options={OUTLINES}
                  onChange={(outline) => updateStyle({ outline })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Marco de esquinas</span>
                <ShapePicker
                  label="Forma del marco de las esquinas"
                  value={style.eyeFrame}
                  options={EYE_FRAMES}
                  onChange={(eyeFrame) => updateStyle({ eyeFrame })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-divider pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Módulos de datos</span>
              <ShapePicker
                label="Forma de los módulos"
                value={style.modules}
                options={MODULES}
                onChange={(modules) => updateStyle({ modules })}
              />
            </div>

            <div className="flex flex-col gap-1.5 border-t border-divider pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Centro de esquinas</span>
              <ShapePicker
                label="Forma del centro de las esquinas"
                value={style.eyeBall}
                options={EYE_BALLS}
                onChange={(eyeBall) => updateStyle({ eyeBall })}
              />
            </div>
          </Panel>

          {/* PASO 3: TINTA Y CONTRASTE (IGUAL QUE EN ESTILO QR DEL PROYECTO) */}
          <Panel
            title="3. Tinta y contraste"
            description="Usa tintas oscuras sobre un fondo claro para garantizar lectura inmediata en cualquier celular."
          >
            <ColorField
              label="Módulos"
              value={colors.modules}
              custom={style.colors.modules !== null}
              autoLabel="Negro clásico (#000000)"
              disabled={false}
              onChange={(c: HexColor) => updateColors({ modules: c })}
              onReset={() => updateColors({ modules: null })}
            />
            <ColorField
              label="Marco de las esquinas"
              value={colors.eyeFrame}
              custom={style.colors.eyeFrame !== null}
              autoLabel="Igual que los módulos"
              disabled={false}
              onChange={(c: HexColor) => updateColors({ eyeFrame: c })}
              onReset={() => updateColors({ eyeFrame: null })}
            />
            <ColorField
              label="Centro de las esquinas"
              value={colors.eyeBall}
              custom={style.colors.eyeBall !== null}
              autoLabel="Igual que el marco"
              disabled={false}
              onChange={(c: HexColor) => updateColors({ eyeBall: c })}
              onReset={() => updateColors({ eyeBall: null })}
            />
            <ColorField
              label="Fondo"
              value={colors.background}
              custom={style.colors.background !== null}
              autoLabel="Blanco clásico (#FFFFFF)"
              disabled={false}
              onChange={(c: HexColor) => updateColors({ background: c })}
              onReset={() => updateColors({ background: null })}
            />
          </Panel>

          {/* PASO 4: ISOTIPO CENTRAL (LOGO) (IGUAL QUE EN ESTILO QR DEL PROYECTO) */}
          <Panel
            title="4. Isotipo central (Logo)"
            description="Elige un isotipo vectorial para el centro del código QR o sube un archivo personalizado."
          >
            <LogoControls
              logo={style.logo}
              disabled={false}
              onChange={(logo) => updateStyle({ logo })}
              hideSliders
            />
          </Panel>
        </div>

        {/* COLUMNA DERECHA: VISTA PREVIA Y DESCARGA SIMPLE */}
        <div className="order-1 flex flex-col gap-4 lg:sticky lg:top-4 lg:order-2 lg:self-start">
          <Panel
            title="Mesa de pruebas en vivo"
            description="Apunta con la cámara de tu celular a la pantalla para probarlo antes de descargar."
          >
            <div className="flex flex-col items-center gap-4">
              <div className="flex aspect-square w-full max-w-[320px] items-center justify-center rounded-2xl border border-divider bg-background p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={svgDataUrl(sceneSvg)}
                  alt="Vista previa de tu código QR"
                  className="max-h-full max-w-full select-none object-contain"
                  draggable={false}
                />
              </div>

              <div className="flex w-full items-center justify-center gap-2 text-xs text-muted">
                <CheckCircleOutlineIcon fontSize="small" color="success" />
                <span>Alta lectura garantizada (incluso con logo al centro)</span>
              </div>

              <div className="flex w-full flex-col gap-2.5">
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadSvg}
                  className="!rounded-full !py-2.5 !font-semibold"
                >
                  Descargar vector (SVG)
                </Button>
              </div>
            </div>

            {warnings.map((warning, i) => (
              <Alert
                key={i}
                severity={"level" in warning && warning.level === "block" ? "error" : "warning"}
              >
                {describeLayoutWarning(warning)}
              </Alert>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
