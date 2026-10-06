/**
 * Cliente de la vista previa: pide al servidor las piezas ya dibujadas (Gotham
 * solo vive en el servidor). Agrupa en lotes lo que se pide en una misma
 * ventana de tiempo, cachea por contenido (LRU) y comparte las peticiones
 * idénticas, de modo que 1000 piezas con paginación no son 1000 llamadas.
 */
import { PREVIEW_MAX_TILES, type PreviewRequestInput, type PreviewResponse, type PreviewTile, type PreviewTileResult } from "@/schemas/preview";
import type { ProjectLayout, QRRecord, TemplateOverrides } from "@/types";

export type TileFetcher = (request: PreviewRequestInput, signal?: AbortSignal) => Promise<PreviewResponse>;

export interface TileContext {
  templateId: string;
  templateOverrides: TemplateOverrides;
  layout: ProjectLayout;
  detail: "full" | "low";
}

export type TileInput = Omit<PreviewTile, "key">;

/** Solo los campos que cambian el dibujo de una pieza. */
export function tileInputOf(record: QRRecord): TileInput {
  return {
    recordId: record.id,
    area: record.area,
    estacion: record.estacion,
    mesa: record.mesa,
    subgrupo: record.subgrupo,
    concepto: record.concepto,
    menuUrl: record.menuUrl,
    qr: record.qr,
    ...(record.qrUrl === undefined ? {} : { qrUrl: record.qrUrl }),
  };
}

interface Pending {
  cacheKey: string;
  groupKey: string;
  context: TileContext;
  tile: TileInput;
  resolvers: Array<{ resolve: (r: PreviewTileResult) => void; reject: (e: unknown) => void }>;
}

export class TilePreviewClient {
  private readonly cache = new Map<string, PreviewTileResult>();
  private queue = new Map<string, Pending>();
  private inflight = new Map<string, Promise<PreviewTileResult>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Número de llamadas al servidor (para las pruebas y las métricas). */
  requests = 0;

  constructor(
    private readonly fetchTiles: TileFetcher,
    private readonly options: { batchMs?: number; cacheSize?: number } = {},
  ) {}

  /** Resultado ya en caché (sin red): evita el parpadeo al volver a una pieza. */
  peek(context: TileContext, tile: TileInput): PreviewTileResult | undefined {
    const { cacheKey } = this.keys(context, tile);
    const hit = this.cache.get(cacheKey);
    if (hit) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, hit); // LRU
    }
    return hit;
  }

  request(context: TileContext, tile: TileInput): Promise<PreviewTileResult> {
    const cached = this.peek(context, tile);
    if (cached) return Promise.resolve(cached);

    const { cacheKey, groupKey } = this.keys(context, tile);
    const running = this.inflight.get(cacheKey);
    if (running) return running;

    const promise = new Promise<PreviewTileResult>((resolve, reject) => {
      const existing = this.queue.get(cacheKey);
      if (existing) existing.resolvers.push({ resolve, reject });
      else this.queue.set(cacheKey, { cacheKey, groupKey, context, tile, resolvers: [{ resolve, reject }] });
    });
    this.inflight.set(cacheKey, promise);
    promise.then(
      () => this.inflight.delete(cacheKey),
      () => this.inflight.delete(cacheKey),
    );
    this.timer ??= setTimeout(() => void this.flush(), this.options.batchMs ?? 20);
    return promise;
  }

  /** Vacía la caché (p. ej. al cambiar de proyecto). */
  clear(): void {
    this.cache.clear();
  }

  private keys(context: TileContext, tile: TileInput): { cacheKey: string; groupKey: string } {
    const own = context.layout.overrides[tile.recordId] ?? null;
    const groupKey = JSON.stringify([context.templateId, context.templateOverrides, context.layout.base, context.detail]);
    return { groupKey, cacheKey: JSON.stringify([groupKey, own, tile]) };
  }

  private remember(key: string, result: PreviewTileResult): void {
    this.cache.set(key, result);
    const max = this.options.cacheSize ?? 400;
    while (this.cache.size > max) this.cache.delete(this.cache.keys().next().value as string);
  }

  private async flush(): Promise<void> {
    this.timer = undefined;
    const pending = [...this.queue.values()];
    this.queue = new Map();

    const groups = new Map<string, Pending[]>();
    for (const item of pending) groups.set(item.groupKey, [...(groups.get(item.groupKey) ?? []), item]);

    await Promise.all(
      [...groups.values()].flatMap((items) => {
        const chunks: Pending[][] = [];
        for (let i = 0; i < items.length; i += PREVIEW_MAX_TILES) chunks.push(items.slice(i, i + PREVIEW_MAX_TILES));
        return chunks.map((chunk) => this.send(chunk));
      }),
    );
  }

  private async send(chunk: Pending[]): Promise<void> {
    const first = chunk[0];
    if (!first) return;
    const { templateId, templateOverrides, layout, detail } = first.context;
    const overrides: ProjectLayout["overrides"] = {};
    for (const p of chunk) {
      const own = layout.overrides[p.tile.recordId];
      if (own) overrides[p.tile.recordId] = own;
    }
    this.requests++;
    try {
      const response = await this.fetchTiles({
        templateId,
        templateOverrides,
        layout: { templateId: layout.templateId, base: layout.base, overrides },
        detail,
        tiles: chunk.map((p, index) => ({ ...p.tile, key: String(index) })),
      });
      chunk.forEach((p, index) => {
        const result = response.tiles[String(index)];
        if (!result) {
          p.resolvers.forEach((r) => r.reject(new Error("El servidor no devolvió la pieza")));
          return;
        }
        this.remember(p.cacheKey, result);
        p.resolvers.forEach((r) => r.resolve(result));
      });
    } catch (error) {
      for (const p of chunk) p.resolvers.forEach((r) => r.reject(error));
    }
  }
}
