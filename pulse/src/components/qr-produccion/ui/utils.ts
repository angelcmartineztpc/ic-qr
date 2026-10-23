import { useEffect, useState, type CSSProperties } from "react";

export type Sx = CSSProperties;

/** Une clases ignorando falsos. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** `sx` de MUI queda reducido a estilos en línea (sin selectores ni tokens de tema). */
export function mergeStyle(style?: CSSProperties, sx?: Sx): CSSProperties | undefined {
  return style || sx ? { ...sx, ...style } : undefined;
}

/** Equivalente a `useMediaQuery(query)`; recibe una media query CSS completa. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const on = () => setMatch(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return match;
}
