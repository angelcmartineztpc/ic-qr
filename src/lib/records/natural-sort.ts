/** Orden natural en español: "M2" < "M10", sin distinguir mayúsculas ni acentos. */
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export const compareNatural = (a: string, b: string): number => collator.compare(a, b);
