import { describe, expect, it } from "vitest";

import { bucketStart } from "../../src/utils/time";

describe("bucketStart", () => {
  it("floors to the nearest minute by default", () => {
    // 2026-01-01T00:01:30.500Z → 2026-01-01T00:01:00.000Z
    const ts = new Date("2026-01-01T00:01:30.500Z").getTime();
    const result = bucketStart(ts);
    expect(result).toBe(new Date("2026-01-01T00:01:00.000Z").getTime());
  });

  it("returns the same value when already on a boundary", () => {
    const ts = new Date("2026-01-01T00:02:00.000Z").getTime();
    expect(bucketStart(ts)).toBe(ts);
  });

  it("supports custom window sizes", () => {
    const ts = new Date("2026-01-01T00:00:15.000Z").getTime();
    const result = bucketStart(ts, 10_000);
    expect(result).toBe(new Date("2026-01-01T00:00:10.000Z").getTime());
  });

  it("handles zero timestamp", () => {
    expect(bucketStart(0)).toBe(0);
  });

  it("handles 10-second windows correctly", () => {
    const ts = new Date("2026-01-01T00:00:37.000Z").getTime();
    const result = bucketStart(ts, 10_000);
    expect(result).toBe(new Date("2026-01-01T00:00:30.000Z").getTime());
  });
});
