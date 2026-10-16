import { describe, expect, it } from "vitest";

import { timeAgo } from "./format";

const now = new Date("2026-10-06T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("timeAgo", () => {
  it.each([
    [10_000, "hace un momento"],
    [5 * 60_000, "hace 5 min"],
    [2 * 3_600_000, "hace 2 h"],
    [24 * 3_600_000, "hace 1 día"],
    [3 * 24 * 3_600_000, "hace 3 días"],
  ])("%d ms → %s", (ms, expected) => expect(timeAgo(ago(ms), now)).toBe(expected));
  it("una fecha inválida no rompe", () => expect(timeAgo("no es fecha", now)).toBe("hace un momento"));
});
