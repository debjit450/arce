import { describe, expect, it, vi } from "vitest";

import { createArceMiddleware } from "../../src/sdk/express-middleware";
import type { ArceClient } from "../../src/sdk/client";
import type { EnforcementResult } from "../../src/types";
import type { Request, Response } from "express";

function mockResult(allowed: boolean): EnforcementResult {
  return {
    mode: "consume",
    allowed,
    blocked: !allowed,
    subject: "ip:10.0.0.1",
    fingerprint: "GET:/test",
    algorithm: "token_bucket",
    cost: 1,
    anomalies: [],
    behavior: {
      recentTenSecondCount: 1,
      trailingMinuteCount: 1,
      averageTenSecondCount: 0,
      duplicateFingerprintCount: 0,
      duplicateFingerprintRatio: 0,
      uniqueRouteCount: 1,
      deniedLastFiveMinutes: 0,
      missingUserAgentCount: 0,
      activeBlock: null
    },
    effectivePolicy: {
      algorithm: "token_bucket",
      tier: "normal",
      baseLimitPerMinute: 100,
      effectiveLimitPerMinute: 100,
      capacity: 100,
      windowMs: 60_000,
      refillTokensPerMs: 100 / 60_000,
      leakRatePerMs: 100 / 60_000,
      riskScore: 0,
      reasons: [],
      blockDurationSeconds: 0
    },
    decision: { allowed, remaining: 99, retryAfterMs: 0, resetAfterMs: 60_000 },
    evaluatedAt: new Date().toISOString()
  };
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    originalUrl: "/test",
    method: "GET",
    ip: "10.0.0.1",
    headers: { "user-agent": "test-agent" },
    header: vi.fn().mockReturnValue(undefined),
    socket: { remoteAddress: "10.0.0.1" },
    ...overrides
  } as unknown as Request;
}

function mockResponse(): Response & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
} {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    setHeader(key: string, value: string) {
      res._headers[key] = value;
      return res;
    }
  };
  return res as never;
}

describe("createArceMiddleware", () => {
  it("calls next() on allowed request", async () => {
    const consume = vi.fn().mockResolvedValue(mockResult(true));
    const client = { consume } as unknown as ArceClient;
    const middleware = createArceMiddleware({ client });
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    await (middleware as (...args: unknown[]) => Promise<void>)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._headers["x-rate-limit-remaining"]).toBe("99");
  });

  it("returns 429 on denied request", async () => {
    const consume = vi.fn().mockResolvedValue(mockResult(false));
    const client = { consume } as unknown as ArceClient;
    const middleware = createArceMiddleware({ client });
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    await (middleware as (...args: unknown[]) => Promise<void>)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(429);
  });

  it("forwards errors to next()", async () => {
    const error = new Error("connection failed");
    const consume = vi.fn().mockRejectedValue(error);
    const client = { consume } as unknown as ArceClient;
    const middleware = createArceMiddleware({ client });
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    await (middleware as (...args: unknown[]) => Promise<void>)(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
