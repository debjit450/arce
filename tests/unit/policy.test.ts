import { describe, expect, it } from "vitest";

import { buildEffectivePolicy } from "../../src/core/adaptive-policy";
import { analyzeBehavior } from "../../src/core/abuse-detector";
import type { BehaviorSnapshot } from "../../src/types";

function baselineSnapshot(): BehaviorSnapshot {
  return {
    recentTenSecondCount: 3,
    trailingMinuteCount: 18,
    averageTenSecondCount: 3,
    duplicateFingerprintCount: 2,
    duplicateFingerprintRatio: 0.11,
    uniqueRouteCount: 2,
    deniedLastFiveMinutes: 0,
    missingUserAgentCount: 0,
    activeBlock: null
  };
}

describe("adaptive policy", () => {
  it("keeps normal traffic in the normal tier", () => {
    const snapshot = baselineSnapshot();
    const assessment = analyzeBehavior(snapshot);
    const policy = buildEffectivePolicy({
      algorithm: "token_bucket",
      assessment,
      behavior: snapshot,
      baseLimitPerMinute: 100
    });

    expect(assessment.riskScore).toBe(0);
    expect(policy.tier).toBe("normal");
    expect(policy.effectiveLimitPerMinute).toBe(100);
  });

  it("downgrades suspicious burst traffic", () => {
    const snapshot = {
      ...baselineSnapshot(),
      recentTenSecondCount: 24,
      averageTenSecondCount: 4,
      trailingMinuteCount: 48,
      duplicateFingerprintCount: 16,
      duplicateFingerprintRatio: 0.82
    };

    const assessment = analyzeBehavior(snapshot);
    const policy = buildEffectivePolicy({
      algorithm: "sliding_window",
      assessment,
      behavior: snapshot,
      baseLimitPerMinute: 120
    });

    expect(assessment.riskScore).toBeGreaterThanOrEqual(50);
    expect(policy.tier).toBe("suspicious");
    expect(policy.effectiveLimitPerMinute).toBeLessThan(120);
  });

  it("recommends a block for critical behavior", () => {
    const snapshot = {
      ...baselineSnapshot(),
      recentTenSecondCount: 32,
      averageTenSecondCount: 4,
      trailingMinuteCount: 64,
      duplicateFingerprintCount: 24,
      duplicateFingerprintRatio: 0.9,
      uniqueRouteCount: 14,
      deniedLastFiveMinutes: 8
    };

    const assessment = analyzeBehavior(snapshot);
    const policy = buildEffectivePolicy({
      algorithm: "leaky_bucket",
      assessment,
      behavior: snapshot,
      baseLimitPerMinute: 100
    });

    expect(assessment.recommendedBlock).toBe(true);
    expect(policy.tier).toBe("blocked");
    expect(policy.blockDurationSeconds).toBeGreaterThan(0);
  });
});
