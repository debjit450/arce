import { describe, expect, it } from "vitest";

import { analyzeBehavior } from "../../src/core/abuse-detector";
import type { BehaviorSnapshot } from "../../src/types";

function baseline(): BehaviorSnapshot {
  return {
    recentTenSecondCount: 0,
    trailingMinuteCount: 0,
    averageTenSecondCount: 0,
    duplicateFingerprintCount: 0,
    duplicateFingerprintRatio: 0,
    uniqueRouteCount: 0,
    deniedLastFiveMinutes: 0,
    missingUserAgentCount: 0,
    activeBlock: null
  };
}

describe("analyzeBehavior", () => {
  describe("burst spike detection", () => {
    it("does not flag when below thresholds", () => {
      const snapshot = {
        ...baseline(),
        recentTenSecondCount: 14,
        averageTenSecondCount: 5
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "burst_spike")
      ).toBeUndefined();
    });

    it("does not flag high count with low ratio", () => {
      const snapshot = {
        ...baseline(),
        recentTenSecondCount: 15,
        averageTenSecondCount: 10
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "burst_spike")
      ).toBeUndefined();
    });

    it("flags when count >= 15 and ratio >= 3", () => {
      const snapshot = {
        ...baseline(),
        recentTenSecondCount: 15,
        averageTenSecondCount: 5
      };
      const result = analyzeBehavior(snapshot);
      const anomaly = result.anomalies.find((a) => a.code === "burst_spike");
      expect(anomaly).toBeDefined();
      expect(anomaly!.severity).toBe("high");
      expect(result.riskScore).toBe(35);
    });

    it("uses raw count as ratio when average is zero", () => {
      const snapshot = {
        ...baseline(),
        recentTenSecondCount: 15,
        averageTenSecondCount: 0
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "burst_spike")
      ).toBeDefined();
    });
  });

  describe("repeated identical requests", () => {
    it("does not flag when below thresholds", () => {
      const snapshot = {
        ...baseline(),
        duplicateFingerprintCount: 7,
        duplicateFingerprintRatio: 0.8
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "repeated_identical_requests")
      ).toBeUndefined();
    });

    it("does not flag high count with low ratio", () => {
      const snapshot = {
        ...baseline(),
        duplicateFingerprintCount: 10,
        duplicateFingerprintRatio: 0.6
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "repeated_identical_requests")
      ).toBeUndefined();
    });

    it("flags when count >= 8 and ratio >= 0.7", () => {
      const snapshot = {
        ...baseline(),
        duplicateFingerprintCount: 8,
        duplicateFingerprintRatio: 0.7
      };
      const result = analyzeBehavior(snapshot);
      const anomaly = result.anomalies.find(
        (a) => a.code === "repeated_identical_requests"
      );
      expect(anomaly).toBeDefined();
      expect(anomaly!.severity).toBe("high");
      expect(result.riskScore).toBe(30);
    });
  });

  describe("wide route scan", () => {
    it("does not flag few routes", () => {
      const snapshot = {
        ...baseline(),
        uniqueRouteCount: 11,
        trailingMinuteCount: 40
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "wide_route_scan")
      ).toBeUndefined();
    });

    it("does not flag many routes with low traffic", () => {
      const snapshot = {
        ...baseline(),
        uniqueRouteCount: 15,
        trailingMinuteCount: 20
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "wide_route_scan")
      ).toBeUndefined();
    });

    it("flags when routes >= 12 and trailing count >= 30", () => {
      const snapshot = {
        ...baseline(),
        uniqueRouteCount: 12,
        trailingMinuteCount: 30
      };
      const result = analyzeBehavior(snapshot);
      const anomaly = result.anomalies.find(
        (a) => a.code === "wide_route_scan"
      );
      expect(anomaly).toBeDefined();
      expect(anomaly!.severity).toBe("medium");
      expect(result.riskScore).toBe(25);
    });
  });

  describe("repeated denials", () => {
    it("does not flag below threshold", () => {
      const snapshot = { ...baseline(), deniedLastFiveMinutes: 4 };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "repeated_denials")
      ).toBeUndefined();
    });

    it("flags when denied >= 5", () => {
      const snapshot = { ...baseline(), deniedLastFiveMinutes: 5 };
      const result = analyzeBehavior(snapshot);
      const anomaly = result.anomalies.find(
        (a) => a.code === "repeated_denials"
      );
      expect(anomaly).toBeDefined();
      expect(anomaly!.severity).toBe("medium");
      expect(result.riskScore).toBe(15);
    });
  });

  describe("missing user agent", () => {
    it("does not flag low volume", () => {
      const snapshot = {
        ...baseline(),
        missingUserAgentCount: 15,
        recentTenSecondCount: 9
      };
      const result = analyzeBehavior(snapshot);
      expect(
        result.anomalies.find((a) => a.code === "missing_user_agent")
      ).toBeUndefined();
    });

    it("flags when count >= 10 and recent traffic >= 10", () => {
      const snapshot = {
        ...baseline(),
        missingUserAgentCount: 10,
        recentTenSecondCount: 10
      };
      const result = analyzeBehavior(snapshot);
      const anomaly = result.anomalies.find(
        (a) => a.code === "missing_user_agent"
      );
      expect(anomaly).toBeDefined();
      expect(anomaly!.severity).toBe("low");
      expect(result.riskScore).toBe(10);
    });
  });

  describe("active block override", () => {
    it("overrides risk score to at least 90 when an active block exists", () => {
      const snapshot = {
        ...baseline(),
        activeBlock: {
          reason: "test block",
          ttlMs: 60_000,
          expiresAtMs: Date.now() + 60_000
        }
      };
      const result = analyzeBehavior(snapshot);
      expect(result.riskScore).toBeGreaterThanOrEqual(90);
      expect(result.reasons).toContain(
        "An active temporary block is already in effect."
      );
    });
  });

  describe("recommended block", () => {
    it("does not recommend block below 75", () => {
      const snapshot = {
        ...baseline(),
        recentTenSecondCount: 15,
        averageTenSecondCount: 5,
        duplicateFingerprintCount: 8,
        duplicateFingerprintRatio: 0.7
      };
      const result = analyzeBehavior(snapshot);
      // 35 + 30 = 65
      expect(result.riskScore).toBe(65);
      expect(result.recommendedBlock).toBe(false);
    });

    it("recommends block at 75 or above", () => {
      const snapshot = {
        ...baseline(),
        recentTenSecondCount: 15,
        averageTenSecondCount: 5,
        duplicateFingerprintCount: 8,
        duplicateFingerprintRatio: 0.7,
        uniqueRouteCount: 12,
        trailingMinuteCount: 30
      };
      const result = analyzeBehavior(snapshot);
      // 35 + 30 + 25 = 90
      expect(result.riskScore).toBe(90);
      expect(result.recommendedBlock).toBe(true);
    });
  });

  describe("cumulative scoring", () => {
    it("accumulates risk from multiple signals", () => {
      const snapshot = {
        ...baseline(),
        recentTenSecondCount: 20,
        averageTenSecondCount: 5,
        duplicateFingerprintCount: 10,
        duplicateFingerprintRatio: 0.8,
        uniqueRouteCount: 14,
        trailingMinuteCount: 40,
        deniedLastFiveMinutes: 8,
        missingUserAgentCount: 12
      };
      const result = analyzeBehavior(snapshot);
      // 35 + 30 + 25 + 15 + 10 = 115
      expect(result.riskScore).toBe(115);
      expect(result.anomalies).toHaveLength(5);
      expect(result.recommendedBlock).toBe(true);
    });
  });
});
