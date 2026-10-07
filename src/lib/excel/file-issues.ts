import type { ImportIssue, ImportIssueCode } from "@/types";

/** Mensajes de rechazo del archivo entero (§S1.2-3). `label` es lo corto; `message` lo que se muestra con detalle. */
const FILE_TEXT: Partial<Record<ImportIssueCode, { label: string; message: string }>> = {
  FILE_TOO_LARGE: { label: "Archivo demasiado grande", message: "El archivo supera el tamaño máximo permitido" },
  UNSUPPORTED_MEDIA_TYPE: { label: "Tipo de archivo no admitido", message: "Solo se admiten archivos .xlsx" },
  NOT_A_ZIP: { label: "No es un archivo .xlsx", message: "El archivo no es un libro de Excel .xlsx (CSV, HTML u otro formato renombrado)" },
  ZIP_CORRUPT: { label: "Archivo dañado", message: "El archivo .xlsx está dañado o tiene una estructura que no podemos leer con seguridad" },
  LEGACY_XLS_OR_ENCRYPTED: { label: "Formato .xls antiguo o con contraseña", message: "Formato .xls antiguo o archivo protegido con contraseña. Guárdalo como .xlsx sin contraseña e inténtalo de nuevo" },
  MACRO_ENABLED: { label: "Libro con macros", message: "El libro tiene macros (.xlsm). Guárdalo como .xlsx normal e inténtalo de nuevo" },
  TEMPLATE_FILE: { label: "Plantilla de Excel", message: "El archivo es una plantilla de Excel (.xltx). Guárdalo como .xlsx normal e inténtalo de nuevo" },
  NOT_XLSX: { label: "No es un libro de Excel", message: "El archivo no contiene un libro de Excel .xlsx válido" },
  XLSB_UNSUPPORTED: { label: "Formato .xlsb no admitido", message: "El formato .xlsb (binario) no se admite. Guárdalo como .xlsx" },
  ZIP_BOMB: { label: "Archivo sospechoso", message: "El archivo se descomprime a un tamaño desproporcionado y se rechazó por seguridad" },
  ZIP_SIZE_MISMATCH: { label: "Archivo inconsistente", message: "El archivo declara tamaños que no coinciden con su contenido y se rechazó por seguridad" },
  ZIP_TOO_MANY_ENTRIES: { label: "Demasiados componentes", message: "El archivo contiene demasiados componentes internos" },
  TOO_MANY_CELLS: { label: "Demasiadas celdas", message: "El libro tiene demasiadas celdas. Quita columnas o filas que no necesites" },
  PARSE_TIMEOUT: { label: "Lectura demasiado lenta", message: "Leer el archivo tardó demasiado y se canceló. Prueba con un archivo más pequeño" },
  NO_SHEET_WITH_HEADERS: { label: "No se encontró la tabla", message: "No encontramos una hoja con columnas reconocibles (Área, Mesa, Link del menú…). Revisa que la primera fila tenga los títulos" },
  TOO_MANY_ROWS: { label: "Demasiadas filas", message: "El archivo tiene más filas de las permitidas" },
  TOO_MANY_COLUMNS: { label: "Demasiadas columnas", message: "La hoja tiene más columnas de las permitidas" },
};

export function fileIssue(code: ImportIssueCode, detail?: string): ImportIssue {
  const text = FILE_TEXT[code] ?? { label: "No se pudo leer el archivo", message: "No se pudo leer el archivo" };
  return { row: null, field: "file", value: null, label: text.label, message: detail ? `${text.message}. ${detail}` : text.message, severity: "error", code };
}

/** Estado HTTP con el que el servidor responde a cada rechazo del archivo. */
export function fileIssueStatus(code: ImportIssueCode): number {
  switch (code) {
    case "FILE_TOO_LARGE":
      return 413;
    case "UNSUPPORTED_MEDIA_TYPE":
      return 415;
    default:
      return 422;
  }
}
