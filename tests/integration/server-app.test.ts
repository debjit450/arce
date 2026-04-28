import path from "node:path";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServerApp } from "../../src/api/app";
import type { DashboardSnapshot, EnforcementResult } from "../../src/types";

const evaluationResult: EnforcementResult = {
  mode: "consume",
  allowed: true,
  blocked: false,
  subject: "ip:203.0.113.10",
  fingerprint: "GET:/orders",
  algorithm: "token_bucket",
  cost: 1,
  anomalies: [],
  behavior: {
    recentTenSecondCount: 1,
    trailingMinuteCount: 1,
    averageTenSecondCount: 0,
    duplicateFingerprintCount: 1,
    duplicateFingerprintRatio: 1,
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
    reasons: ["Traffic remained within the normal behavioral profile."],
    blockDurationSeconds: 0
  },
  decision: {
    allowed: true,
    remaining: 99,
    retryAfterMs: 0,
    resetAfterMs: 60_000
  },
  evaluatedAt: new Date().toISOString()
};

const dashboardSnapshot: DashboardSnapshot = {
  totals: {
    requests: 12,
    allowed: 10,
    rateLimited: 2,
    blocked: 0,
    anomalies: 1
  },
  recentSeries: [],
  activeBlocks: [],
  recentAnomalies: []
};

describe("server app", () => {
  const ping = vi.fn();
  const evaluate = vi.fn();
  const getDashboardSnapshot = vi.fn();

  beforeEach(() => {
    ping.mockResolvedValue("PONG");
    evaluate.mockResolvedValue(evaluationResult);
    getDashboardSnapshot.mockResolvedValue(dashboardSnapshot);
  });

  it("serves health and rate-limit endpoints", async () => {
    const app = createServerApp({
      redis: { ping } as never,
      limiterService: { evaluate, getDashboardSnapshot } as never,
      dashboardPublicDir: path.join(
        process.cwd(),
        "apps",
        "dashboard",
        "public"
      )
    });

    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body.redis).toBe("PONG");

    const consume = await request(app).post("/consume").send({
      algorithm: "token_bucket",
      route: "/orders",
      method: "GET",
      ip: "203.0.113.10",
      scope: "ip"
    });

    expect(consume.status).toBe(200);
    expect(consume.body.allowed).toBe(true);
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "/orders",
        method: "GET"
      }),
      true
    );
  });

  it("serves dashboard metrics", async () => {
    const app = createServerApp({
      redis: { ping } as never,
      limiterService: { evaluate, getDashboardSnapshot } as never,
      dashboardPublicDir: path.join(
        process.cwd(),
        "apps",
        "dashboard",
        "public"
      )
    });

    const response = await request(app).get("/api/dashboard-data");

    expect(response.status).toBe(200);
    expect(response.body.totals.requests).toBe(12);
    expect(getDashboardSnapshot).toHaveBeenCalled();
  });
});
