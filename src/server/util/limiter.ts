/** Límite de concurrencia con cola (a diferencia de Semaphore, que rechaza). Para trabajo interno acotado. */
export class AsyncLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {
    if (max < 1) throw new RangeError("max debe ser ≥ 1");
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** Ejecuta `task` sobre cada elemento con como mucho `concurrency` en paralelo; conserva el orden. */
export async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await task(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}
