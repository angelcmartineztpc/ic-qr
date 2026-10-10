/**
 * Token bucket en memoria por clave (MVP de una réplica, §A.5 "Topología").
 * Con varias réplicas hay que sustituirlo por un limitador compartido.
 */
export interface RateLimitDecision {
  allowed: boolean;
  /** Segundos hasta que haya un token disponible (solo si allowed=false). */
  retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly refillPerMs: number;

  constructor(
    private readonly capacity: number,
    perMinute: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {
    this.refillPerMs = perMinute / 60_000;
  }

  take(key: string): RateLimitDecision {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs);
    bucket.updatedAt = now;

    let decision: RateLimitDecision;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      decision = { allowed: true, retryAfterSeconds: 0 };
    } else {
      decision = { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / this.refillPerMs / 1000)) };
    }

    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    if (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
    return decision;
  }
}

/** Limitador por minuto con ráfaga igual al cupo por minuto. */
export function perMinute(limit: number, now?: () => number): RateLimiter {
  return new RateLimiter(limit, limit, now);
}
