# Kit de UI de QR Producción

Sustituto de MUI para migrar pantallas cambiando el import: `import { Button, TextField } from "@/components/qr-produccion/ui"`.
CSS Modules + variables de tema de PULSE (Dark/Light/Sepia). Iconos: `lucide-react` (los iconos de MUI se cambian a mano, `fontSize="small"` -> `size={18}`).

## Diferencias globales con MUI (leer primero)
- **`sx`**: solo admite estilos en línea (`CSSProperties`): sin selectores, sin tokens de tema, sin breakpoints. Para lo demás usa `className` + CSS Module de la pantalla.
- **`color`**: `primary | error | inherit` (Button/IconButton); Chip `default|primary|success|warning|error|info`.
- **Tailwind/`!important`**: no existen; no copiar `className="!w-44 ..."`. Usa `style`/CSS Module.
- **Enlaces**: `component={Link} href="/x"` pasa a `to="/x"` (react-router). `href` queda para URLs externas.
- **Select**: es `<select>` **nativo**. Los hijos `<MenuItem value>` se renderizan como `<option>` (solo texto). `renderValue` no existe.
- Todos aceptan `className`, `style` y `data-*`/`aria-*`. Objetivos táctiles >= 40 px, foco visible, `prefers-reduced-motion` respetado.
- `autoFocus` en Button/IconButton/TextField funciona dentro de `Dialog` (se enfoca al abrir).

## Componentes
| Componente | Props (además de las HTML nativas) |
|---|---|
| `Button` | `variant` contained\|outlined\|text (def. text), `color` primary\|error\|inherit, `size` small\|medium\|large, `startIcon`, `endIcon`, `loading`, `fullWidth`, `to`, `href`, `component`, `disabled`, `autoFocus`, `sx` |
| `ButtonBase` | botón sin estilo (para tarjetas/opciones con `role`); `to`, `href`, `component`, `autoFocus` |
| `IconButton` | `size`, `color` primary\|error\|inherit, `edge` (ignorada), `to`/`href`/`component`; requiere `aria-label` |
| `Link` | `to` (interno) o `href`, `underline` none\|hover\|always |
| `TextField` | `label`, `helperText`, `error`, `multiline` (+`rows`/`minRows`/`maxRows`), `select`, `type`, `value`, `defaultValue`, `onChange/onBlur/onFocus/onKeyDown`, `size` small\|medium, `fullWidth`, `required`, `disabled`, `readOnly`, `autoFocus`, `placeholder`, `name`, `id`, `startAdornment`, `endAdornment`, `slotProps={{ htmlInput, input:{start/endAdornment} }}` |
| `InputAdornment` | `position` start\|end |
| `FormControl` / `InputLabel` / `Select` | `FormControl{size,disabled,fullWidth}` + `InputLabel id` + `Select{labelId,value,onChange}` con `MenuItem` hijos |
| `FormLabel`, `FormGroup{row}`, `FormHelperText{error}` | etiquetas/agrupadores |
| `Alert` | `severity` info\|warning\|error\|success, `variant` standard\|outlined, `title`, `action`, `onClose`, `icon` (o `false`), `role` (def. alert para error/warning, status para el resto) |
| `Dialog` | `open`, `onClose(e, reason)` reason backdropClick\|escapeKeyDown, `fullWidth`, `maxWidth` xs\|sm\|md\|lg\|xl\|false, `fullScreen`, `aria-labelledby`, `aria-describedby`. Sobre `<dialog>` nativo; los hijos solo se montan abiertos |
| `DialogTitle` / `DialogContent{dividers}` / `DialogContentText` / `DialogActions` | estructura del diálogo (`DialogTitle` es `h2`; pásale `id`) |
| `Chip` | `label`, `size` small\|medium, `color`, `variant` filled\|outlined, `icon`, `onClick` (lo vuelve botón) |
| `Tooltip` | `title`, `arrow` (ignorada), `placement` top\|bottom; un hijo. Envuelve en `<span>`; no dar el único nombre accesible: ponle `aria-label` al control |
| `Switch` / `Checkbox{indeterminate}` / `Radio` | `checked`, `defaultChecked`, `onChange(e, checked)`, `disabled`, `size`, `color`, `name`, `value`, `inputProps`/`slotProps.input` (aria-label) |
| `RadioGroup` | `value`, `name`, `row`, `onChange(e, value)` |
| `FormControlLabel` | `control`, `label`, `value`, `disabled`, `labelPlacement` end\|start |
| `ToggleButtonGroup` | `value`, `exclusive`, `onChange(e, value)` (exclusivo: valor o `null`), `size`, `fullWidth`, `disabled`, `aria-label` |
| `ToggleButton` | `value`, `selected`, `size`, `onChange`, `aria-label` |
| `LinearProgress` | `variant` determinate\|indeterminate, `value` 0-100, `color` |
| `CircularProgress` | `size` (px o CSS), `color` primary\|error\|inherit, `aria-label` |
| `Skeleton` | `variant` text\|rectangular\|rounded\|circular, `width`, `height`, `animation` pulse\|false |
| `Menu` | `anchorEl`, `open`, `onClose`, `id`. Portal, flechas/Inicio/Fin, Escape, clic fuera; el foco vuelve al ancla. No se cierra solo al elegir: llama a `onClose` en el `onClick` |
| `MenuItem` | `onClick`, `disabled`, `selected`, `value` (en select). `ListItemIcon`, `ListSubheader` para el contenido |
| `Tabs` / `Tab` | `Tabs{value,onChange(e,value),variant standard\|scrollable\|fullWidth,aria-label}`, `Tab{value,label,disabled}`; flechas cambian la pestaña. El panel (`role="tabpanel"`) lo pones tú |
| `Slider` | `value`, `defaultValue`, `min`, `max`, `step`, `disabled`, `onChange(e, number)`, `onChangeCommitted(e, number)`, `aria-label`/`aria-labelledby` |
| `Accordion` | `defaultExpanded`, `expanded`, `onChange(e, expanded)`, `disableGutters`, `variant` elevation\|outlined, `slotProps={{ heading:{ component:"h2" } }}` |
| `AccordionSummary{expandIcon}` / `AccordionDetails` | cabecera (botón con `aria-expanded`) y región |
| `Card{variant}` / `CardActionArea` | `CardActionArea` es un `<button>` que ocupa todo el ancho |
| `Divider` | `orientation` horizontal\|vertical |
| `Pagination` | `count`, `page`, `onChange(e, page)`, `siblingCount`, `boundaryCount`, `showFirstButton`, `showLastButton`, `getItemAriaLabel` (la envoltura con «Página N de M» sigue siendo de la pantalla) |
| `useMediaQuery(query)` | recibe media query CSS completa, p. ej. `"(max-width: 599.95px)"` (MUI `down("sm")`) |

## No incluido
`Snackbar` (usar `toast` de sonner), `Typography` (usar HTML), `CssBaseline`/`ThemeProvider` (el tema es de PULSE), `Select` con `multiple`/`renderValue`.
