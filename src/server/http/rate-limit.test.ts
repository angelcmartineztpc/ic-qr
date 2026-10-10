import { describe, expect, it } from "vitest";

import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("permite la ráfaga, bloquea y se recarga con el tiempo", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60, () => now); // 1 token por segundo
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(true);
    const blocked = limiter.take("a");
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.take("b").allowed).toBe(true);
    now = 1000;
    expect(limiter.take("a").allowed).toBe(true);
  });

  it("acota el número de claves en memoria", () => {
    const limiter = new RateLimiter(1, 1, () => 0, 2);
    limiter.take("a");
    limiter.take("b");
    limiter.take("c");
    expect(limiter.take("a").allowed).toBe(true); // "a" se olvidó y vuelve con el cupo completo
  });
});
