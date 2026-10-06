import type { FontFile } from "@/types";

/** Gotham (decisión R2). Los archivos están en assets/fonts/gotham (no versionados). */
export const GOTHAM_DIR = "gotham";

export const gotham = (weight: 400 | 500 | 700 | 800) => ({ family: "Gotham", weight, style: "normal" as const });

export const GOTHAM_FILES: FontFile[] = [
  { ...gotham(400), file: "Gotham-Book.otf" },
  { ...gotham(500), file: "Gotham-Medium.otf" },
  { ...gotham(700), file: "Gotham-Bold.otf" },
  { ...gotham(800), file: "Gotham-Black.otf" },
];
