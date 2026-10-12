/**
 * Empaquetado de piezas en la página (spec §19, docs/ARCHITECTURE.md §E.7).
 *   F = pieza + 2·sangrado ; P = F + gap ; A = página − márgenes
 *   n = floor((A + gap) / P + 1e-9)          (1e-9 protege encajes exactos: 4 × 50 = 200)
 *   G = n·F + (n − 1)·gap ; origen = margen + (A − G)/2 (si center) + sangrado
 *   slot i: col = i % cols, fila = floor(i / cols); x = origenX + col·Px (multiplicación, nunca acumulación)
 */
import { PAGE_SIZES_MM } from "@/lib/units";
import type { Mm, PageSize, PageSlot, PDFOptions, SheetLayout } from "@/types";

export class SheetLayoutError extends Error {
  constructor(
    readonly code: "TILE_DOES_NOT_FIT",
    readonly printableMm: { width: Mm; height: Mm },
  ) {
    super(
      `La pieza no cabe en el área imprimible (${printableMm.width.toFixed(1)} × ${printableMm.height.toFixed(1)} mm). Reduce los márgenes o usa una página mayor.`,
    );
    this.name = "SheetLayoutError";
  }
}

export function pageSizeMm(size: PageSize): { width: Mm; height: Mm } {
  switch (size.kind) {
    case "A4":
      return { ...PAGE_SIZES_MM.A4 };
    case "Letter":
      return { ...PAGE_SIZES_MM.Letter };
    case "custom":
      return { width: size.widthMm, height: size.heightMm };
  }
}

export interface SheetInput {
  tile: { width: Mm; height: Mm };
  options: Pick<PDFOptions, "mode" | "pageSize" | "orientation" | "margins" | "gapMm" | "bleedMm" | "center" | "maxCols" | "maxRows">;
}

function fit(available: Mm, footprint: Mm, gap: Mm): number {
  if (available < footprint) return 0;
  return Math.floor((available + gap) / (footprint + gap) + 1e-9);
}

function gridFor(page: { width: Mm; height: Mm }, orientation: "portrait" | "landscape", input: SheetInput): SheetLayout | null {
  const { margins, gapMm, bleedMm, center, maxCols, maxRows } = input.options;
  const footprintX = input.tile.width + 2 * bleedMm;
  const footprintY = input.tile.height + 2 * bleedMm;
  const availableX = page.width - margins.left - margins.right;
  const availableY = page.height - margins.top - margins.bottom;

  let cols = fit(availableX, footprintX, gapMm);
  let rows = fit(availableY, footprintY, gapMm);
  if (maxCols !== undefined) cols = Math.min(cols, maxCols);
  if (maxRows !== undefined) rows = Math.min(rows, maxRows);
  if (cols === 0 || rows === 0) return null;

  const gridX = cols * footprintX + (cols - 1) * gapMm;
  const gridY = rows * footprintY + (rows - 1) * gapMm;
  return {
    pageMm: page,
    orientation,
    cols,
    rows,
    perPage: cols * rows,
    originMm: {
      x: margins.left + (center ? (availableX - gridX) / 2 : 0) + bleedMm,
      y: margins.top + (center ? (availableY - gridY) / 2 : 0) + bleedMm,
    },
    pitchMm: { x: footprintX + gapMm, y: footprintY + gapMm },
  };
}

/** Rejilla de la hoja. Lanza SheetLayoutError('TILE_DOES_NOT_FIT') si no cabe ninguna pieza. */
export function packGrid(input: SheetInput): SheetLayout {
  const { options, tile } = input;
  if (options.mode === "single") {
    const page = { width: tile.width + 2 * options.bleedMm, height: tile.height + 2 * options.bleedMm };
    return {
      pageMm: page,
      orientation: page.width > page.height ? "landscape" : "portrait",
      cols: 1,
      rows: 1,
      perPage: 1,
      originMm: { x: options.bleedMm, y: options.bleedMm },
      pitchMm: { x: page.width, y: page.height },
    };
  }

  // A4 y Carta: vertical = lado largo en vertical. Un tamaño personalizado se usa tal como
  // lo escribió el usuario (ancho × alto); solo 'auto' prueba también la página girada.
  const base = pageSizeMm(options.pageSize);
  const custom = options.pageSize.kind === "custom";
  const portrait = custom ? base : { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
  const landscape = { width: portrait.height, height: portrait.width };
  const asEntered = (page: { width: number; height: number }) => (page.width > page.height ? "landscape" : "portrait");
  const candidates =
    options.orientation === "auto"
      ? [gridFor(portrait, asEntered(portrait), input), gridFor(landscape, asEntered(landscape), input)]
      : custom
        ? [gridFor(portrait, asEntered(portrait), input)]
        : options.orientation === "portrait"
          ? [gridFor(portrait, "portrait", input)]
          : [gridFor(landscape, "landscape", input)];

  // 'auto': máximo de piezas por página; empate → vertical.
  const best = candidates.reduce<SheetLayout | null>((acc, grid) => (grid && (!acc || grid.perPage > acc.perPage) ? grid : acc), null);
  if (!best) {
    throw new SheetLayoutError("TILE_DOES_NOT_FIT", {
      width: portrait.width - options.margins.left - options.margins.right,
      height: portrait.height - options.margins.top - options.margins.bottom,
    });
  }
  return best;
}

export const pageCount = (count: number, grid: Pick<SheetLayout, "perPage">): number => (count <= 0 ? 0 : Math.ceil(count / grid.perPage));

/** Posición de cada pieza (esquina superior izquierda, sin sangrado) en orden de lectura. */
export function paginate(count: number, grid: SheetLayout): PageSlot[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const page = Math.floor(index / grid.perPage);
    const slot = index % grid.perPage;
    const col = slot % grid.cols;
    const row = Math.floor(slot / grid.cols);
    return { page, index, xMm: grid.originMm.x + col * grid.pitchMm.x, yMm: grid.originMm.y + row * grid.pitchMm.y };
  });
}

/** Texto en vivo del panel de opciones: "15 por página · 17 páginas". */
export function describeSheet(count: number, grid: SheetLayout): string {
  const pages = pageCount(count, grid);
  return `${grid.perPage} por página · ${pages} ${pages === 1 ? "página" : "páginas"}`;
}
