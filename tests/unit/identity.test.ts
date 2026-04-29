import { describe, expect, it } from "vitest";

import { resolveSubject, buildFingerprint } from "../../src/utils/identity";
import type { LimitRequestPayload } from "../../src/types";

function basePayload(
  overrides: Partial<LimitRequestPayload> = {}
): LimitRequestPayload {
  return {
    algorithm: "token_bucket",
    route: "/test",
    method: "GET",
    ...overrides
  };
}

describe("resolveSubject", () => {
  it("returns hybrid key when scope is hybrid", () => {
    const result = resolveSubject(
      basePayload({ scope: "hybrid", userId: "u1", ip: "1.2.3.4" })
    );
    expect(result).toBe("hybrid:user:u1:ip:1.2.3.4");
  });

  it("returns user key when scope is user", () => {
    const result = resolveSubject(basePayload({ scope: "user", userId: "u1" }));
    expect(result).toBe("user:u1");
  });

  it("returns ip key when scope is ip", () => {
    const result = resolveSubject(basePayload({ scope: "ip", ip: "10.0.0.1" }));
    expect(result).toBe("ip:10.0.0.1");
  });

  it("returns custom key when identifier is provided", () => {
    const result = resolveSubject(basePayload({ identifier: "device-abc" }));
    expect(result).toBe("custom:device-abc");
  });

  it("falls back to userId when no scope is set", () => {
    const result = resolveSubject(basePayload({ userId: "u1" }));
    expect(result).toBe("user:u1");
  });

  it("falls back to ip when no scope and no userId", () => {
    const result = resolveSubject(basePayload({ ip: "10.0.0.1" }));
    expect(result).toBe("ip:10.0.0.1");
  });

  it("throws when no identifier can be derived", () => {
    expect(() => resolveSubject(basePayload())).toThrow(
      "Unable to derive a subject key"
    );
  });
});

describe("buildFingerprint", () => {
  it("uses the provided fingerprint when available", () => {
    const result = buildFingerprint(
      basePayload({ fingerprint: "GET:/api?q=1" })
    );
    expect(result).toBe("GET:/api?q=1");
  });

  it("trims whitespace from provided fingerprint", () => {
    const result = buildFingerprint(
      basePayload({ fingerprint: "  GET:/api  " })
    );
    expect(result).toBe("GET:/api");
  });

  it("builds a default fingerprint from method and route", () => {
    const result = buildFingerprint(
      basePayload({ method: "POST", route: "/orders" })
    );
    expect(result).toBe("POST:/orders");
  });

  it("uppercases the method in default fingerprint", () => {
    const result = buildFingerprint(
      basePayload({ method: "post", route: "/orders" })
    );
    expect(result).toBe("POST:/orders");
  });
});
