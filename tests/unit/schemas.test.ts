import { describe, expect, it } from "vitest";

import { limitRequestSchema } from "../../src/api/schemas";

describe("limitRequestSchema", () => {
  it("accepts minimal valid payload", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      ip: "10.0.0.1",
      scope: "ip"
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing algorithm", () => {
    expect(limitRequestSchema.safeParse({ ip: "10.0.0.1" }).success).toBe(
      false
    );
  });

  it("rejects invalid algorithm", () => {
    expect(
      limitRequestSchema.safeParse({ algorithm: "invalid", ip: "1.2.3.4" })
        .success
    ).toBe(false);
  });

  it("rejects when no identifier provided", () => {
    const r = limitRequestSchema.safeParse({ algorithm: "token_bucket" });
    expect(r.success).toBe(false);
  });

  it("rejects hybrid without userId", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      ip: "1.2.3.4",
      scope: "hybrid"
    });
    expect(r.success).toBe(false);
  });

  it("rejects hybrid without ip", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      userId: "u1",
      scope: "hybrid"
    });
    expect(r.success).toBe(false);
  });

  it("accepts hybrid with both", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      userId: "u1",
      ip: "1.2.3.4",
      scope: "hybrid"
    });
    expect(r.success).toBe(true);
  });

  it("rejects user scope without userId", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      ip: "1.2.3.4",
      scope: "user"
    });
    expect(r.success).toBe(false);
  });

  it("rejects ip scope without ip", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      userId: "u1",
      scope: "ip"
    });
    expect(r.success).toBe(false);
  });

  it("rejects custom scope without identifier", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      ip: "1.2.3.4",
      scope: "custom"
    });
    expect(r.success).toBe(false);
  });

  it("accepts custom scope with identifier", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      identifier: "d1",
      scope: "custom"
    });
    expect(r.success).toBe(true);
  });

  it("enforces max length on userId", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      userId: "x".repeat(257),
      scope: "user"
    });
    expect(r.success).toBe(false);
  });

  it("enforces max length on ip", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      ip: "x".repeat(65),
      scope: "ip"
    });
    expect(r.success).toBe(false);
  });

  it("enforces max length on identifier", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      identifier: "x".repeat(257),
      scope: "custom"
    });
    expect(r.success).toBe(false);
  });

  it("enforces cost range", () => {
    expect(
      limitRequestSchema.safeParse({
        algorithm: "token_bucket",
        ip: "1.2.3.4",
        cost: 0
      }).success
    ).toBe(false);
    expect(
      limitRequestSchema.safeParse({
        algorithm: "token_bucket",
        ip: "1.2.3.4",
        cost: 11
      }).success
    ).toBe(false);
  });

  it("defaults cost, route, and method", () => {
    const r = limitRequestSchema.safeParse({
      algorithm: "token_bucket",
      ip: "1.2.3.4"
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cost).toBe(1);
      expect(r.data.route).toBe("/");
      expect(r.data.method).toBe("GET");
    }
  });
});
