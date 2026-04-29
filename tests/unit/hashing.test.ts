import { describe, expect, it } from "vitest";

import { hashValue } from "../../src/utils/hashing";

describe("hashValue", () => {
  it("returns a 16-character hex string", () => {
    const result = hashValue("test-input");
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns deterministic output for the same input", () => {
    const first = hashValue("hello");
    const second = hashValue("hello");
    expect(first).toBe(second);
  });

  it("returns different output for different inputs", () => {
    const a = hashValue("input-a");
    const b = hashValue("input-b");
    expect(a).not.toBe(b);
  });

  it("handles empty string", () => {
    const result = hashValue("");
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });
});
