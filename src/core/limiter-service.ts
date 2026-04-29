import { randomUUID } from "node:crypto";

import { buildEffectivePolicy } from "./adaptive-policy";
import { analyzeBehavior } from "./abuse-detector";
import type {
  DashboardSnapshot,
  EnforcementResult,
  LimitRequestPayload
} from "../types";
import { BehaviorStore } from "../store/behavior-store";
import { MetricsStore } from "../store/metrics-store";
import { RedisRateLimiterStore } from "../store/rate-limiter-store";
import { buildFingerprint, resolveSubject } from "../utils/identity";

export class LimiterService {
  constructor(
    private readonly limiterStore: RedisRateLimiterStore,
    private readonly behaviorStore: BehaviorStore,
    private readonly metricsStore: MetricsStore
  ) {}

  async evaluate(
    payload: LimitRequestPayload,
    consume: boolean
  ): Promise<EnforcementResult> {
    const nowMs = Date.now();
    const cost = Math.max(1, Math.floor(payload.cost ?? 1));
    const subject = resolveSubject(payload);
    const fingerprint = buildFingerprint(payload);
    const behavior = await this.behaviorStore.observe(subject, {
      route: payload.route,
      fingerprint,
      userAgent: payload.metadata?.userAgent,
      timestampMs: nowMs
    });
    const assessment = analyzeBehavior(behavior);
    const policy = buildEffectivePolicy({
      algorithm: payload.algorithm,
      assessment,
      behavior,
      baseLimitPerMinute: payload.baseLimitPerMinute
    });

    let result: EnforcementResult;

    if (behavior.activeBlock) {
      result = {
        mode: consume ? "consume" : "check",
        allowed: false,
        blocked: true,
        subject,
        fingerprint,
        algorithm: payload.algorithm,
        cost,
        anomalies: assessment.anomalies,
        behavior,
        effectivePolicy: policy,
        decision: {
          allowed: false,
          remaining: 0,
          retryAfterMs: behavior.activeBlock.ttlMs,
          resetAfterMs: behavior.activeBlock.ttlMs
        },
        evaluatedAt: new Date(nowMs).toISOString()
      };
    } else if (policy.tier === "blocked") {
      const reason = policy.reasons.join(" ");
      await this.behaviorStore.registerBlock(
        subject,
        reason,
        policy.blockDurationSeconds
      );

      result = {
        mode: consume ? "consume" : "check",
        allowed: false,
        blocked: true,
        subject,
        fingerprint,
        algorithm: payload.algorithm,
        cost,
        anomalies: assessment.anomalies,
        behavior: {
          ...behavior,
          activeBlock: {
            reason,
            ttlMs: policy.blockDurationSeconds * 1_000,
            expiresAtMs: nowMs + policy.blockDurationSeconds * 1_000
          }
        },
        effectivePolicy: policy,
        decision: {
          allowed: false,
          remaining: 0,
          retryAfterMs: policy.blockDurationSeconds * 1_000,
          resetAfterMs: policy.blockDurationSeconds * 1_000
        },
        evaluatedAt: new Date(nowMs).toISOString()
      };
    } else {
      const decision = await this.limiterStore.evaluate({
        subject,
        algorithm: payload.algorithm,
        policy,
        cost,
        consume,
        nowMs,
        requestId: randomUUID()
      });

      result = {
        mode: consume ? "consume" : "check",
        allowed: decision.allowed,
        blocked: false,
        subject,
        fingerprint,
        algorithm: payload.algorithm,
        cost,
        anomalies: assessment.anomalies,
        behavior,
        effectivePolicy: policy,
        decision,
        evaluatedAt: new Date(nowMs).toISOString()
      };
    }

    await Promise.all([
      this.behaviorStore.recordOutcome(subject, {
        allowed: result.allowed,
        blocked: result.blocked,
        timestampMs: nowMs
      }),
      this.metricsStore.recordDecision(result)
    ]);
    return result;
  }

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const [metrics, activeBlocks] = await Promise.all([
      this.metricsStore.getDashboardMetrics(),
      this.behaviorStore.getActiveBlocks()
    ]);

    return {
      ...metrics,
      activeBlocks
    };
  }
}
