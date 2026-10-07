import type { FontFile } from "@/types";

/**
 * Address Sans Pro Cd Semibold: la tipografía de las piezas (la de la referencia
 * QR_Tropical_1M_Alimentos.pdf). Solo existe este peso. El archivo está en
 * assets/fonts/address-sans y no se versiona (`bun run fonts:setup`).
 */
export const PIECE_FONT_DIR = "address-sans";

export const pieceFont = () => ({ family: "Address Sans Pro Cd", weight: 600, style: "normal" as const });

export const PIECE_FONT_FILES: FontFile[] = [{ ...pieceFont(), file: "AddressSansPro-CdSemibold.otf" }];

/** Color de la referencia (todo el arte es #2C2E35, no negro puro). */
export const PIECE_INK = "#2C2E35";
