/** Log JSON por línea (lo recoge el panel de Supabase). Nunca se escriben tokens, URLs completas ni contenido de archivos. */
type Fields = Readonly<Record<string, string | number>>;

const write = (level: "info" | "warn" | "error", message: string, fields: Fields = {}) => console[level](JSON.stringify({ level, message, ...fields }));

export const log = {
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};

/** Solo el host de una URL: la ruta y la query pueden llevar tokens. */
export const hostOf = (url: string): string => URL.parse(url)?.host ?? "(url no válida)";
