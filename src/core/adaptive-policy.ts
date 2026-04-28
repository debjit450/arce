import { DEFAULT_WINDOW_MS } from "../../configs/constants";
import { runtimeConfig } from "../../configs/runtime";
import type {
  AbuseAssessment,
  BehaviorSnapshot,
  EffectivePolicy,
  PolicyTier,
  RateLimitAlgorithm
} from "../types";

interface BuildPolicyArgs {
  algorithm: RateLimitAlgorithm;
  assessment: AbuseAssessment;
  behavior: BehaviorSnapshot;
  baseLimitPerMinute?: number;
}

export function buildEffectivePolicy(args: BuildPolicyArgs): EffectivePolicy {
  const baseLimitPerMinute =
    args.baseLimitPerMinute ?? runtimeConfig.defaultLimitPerMinute;
  let effectiveLimitPerMinute = baseLimitPerMinute;
  let tier: PolicyTier = "normal";
  const reasons = [...args.assessment.reasons];
  const suspiciousTarget =
    baseLimitPerMinute >= runtimeConfig.suspiciousLimitPerMinute
      ? Math.max(
          runtimeConfig.suspiciousLimitPerMinute,
          Math.round(baseLimitPerMinute * 0.2)
        )
      : Math.max(1, Math.round(baseLimitPerMinute * 0.2));

  if (args.behavior.activeBlock || args.assessment.recommendedBlock) {
    tier = "blocked";
    effectiveLimitPerMinute = suspiciousTarget;
  } else if (args.assessment.riskScore >= 50) {
    tier = "suspicious";
    effectiveLimitPerMinute = suspiciousTarget;
    reasons.push("The subject was downgraded to a suspicious traffic tier.");
  } else if (args.assessment.riskScore >= 25) {
    tier = "elevated";
    effectiveLimitPerMinute = Math.max(
      10,
      Math.round(baseLimitPerMinute * 0.6)
    );
    reasons.push("The subject was downgraded to an elevated-risk tier.");
  } else {
    reasons.push("Traffic remained within the normal behavioral profile.");
  }

  effectiveLimitPerMinute = Math.min(
    baseLimitPerMinute,
    effectiveLimitPerMinute
  );

  const capacity = Math.max(1, effectiveLimitPerMinute);
  const windowMs = DEFAULT_WINDOW_MS;
  const refillTokensPerMs = effectiveLimitPerMinute / windowMs;
  const leakRatePerMs = effectiveLimitPerMinute / windowMs;

  return {
    algorithm: args.algorithm,
    tier,
    baseLimitPerMinute,
    effectiveLimitPerMinute,
    capacity,
    windowMs,
    refillTokensPerMs,
    leakRatePerMs,
    riskScore: args.assessment.riskScore,
    reasons,
    blockDurationSeconds:
      tier === "blocked" ? runtimeConfig.blockDurationSeconds : 0
  };
}
