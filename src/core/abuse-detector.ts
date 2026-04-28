import type { AbuseAssessment, AnomalyFlag, BehaviorSnapshot } from "../types";

function push(
  anomalies: AnomalyFlag[],
  reasons: string[],
  anomaly: AnomalyFlag,
  reason: string
): void {
  anomalies.push(anomaly);
  reasons.push(reason);
}

export function analyzeBehavior(snapshot: BehaviorSnapshot): AbuseAssessment {
  const anomalies: AnomalyFlag[] = [];
  const reasons: string[] = [];
  let riskScore = 0;

  const burstRatio =
    snapshot.averageTenSecondCount > 0
      ? snapshot.recentTenSecondCount / snapshot.averageTenSecondCount
      : snapshot.recentTenSecondCount;

  if (snapshot.recentTenSecondCount >= 15 && burstRatio >= 3) {
    riskScore += 35;
    push(
      anomalies,
      reasons,
      {
        code: "burst_spike",
        severity: "high",
        detail: `Traffic jumped to ${snapshot.recentTenSecondCount} requests in 10s (${burstRatio.toFixed(1)}x baseline).`
      },
      "Burst traffic exceeded the short-term moving average."
    );
  }

  if (
    snapshot.duplicateFingerprintCount >= 8 &&
    snapshot.duplicateFingerprintRatio >= 0.7
  ) {
    riskScore += 30;
    push(
      anomalies,
      reasons,
      {
        code: "repeated_identical_requests",
        severity: "high",
        detail: `${snapshot.duplicateFingerprintCount} near-identical requests accounted for ${(snapshot.duplicateFingerprintRatio * 100).toFixed(0)}% of the last minute.`
      },
      "A repeated request fingerprint suggests automation or scraping."
    );
  }

  if (snapshot.uniqueRouteCount >= 12 && snapshot.trailingMinuteCount >= 30) {
    riskScore += 25;
    push(
      anomalies,
      reasons,
      {
        code: "wide_route_scan",
        severity: "medium",
        detail: `${snapshot.uniqueRouteCount} unique routes were hit within the last minute.`
      },
      "The route spread is consistent with crawling or enumeration."
    );
  }

  if (snapshot.deniedLastFiveMinutes >= 5) {
    riskScore += 15;
    push(
      anomalies,
      reasons,
      {
        code: "repeated_denials",
        severity: "medium",
        detail: `${snapshot.deniedLastFiveMinutes} recent denials were recorded for this subject.`
      },
      "Repeated denials indicate a client pressing against enforced limits."
    );
  }

  if (
    snapshot.missingUserAgentCount >= 10 &&
    snapshot.recentTenSecondCount >= 10
  ) {
    riskScore += 10;
    push(
      anomalies,
      reasons,
      {
        code: "missing_user_agent",
        severity: "low",
        detail: "High request volume arrived without a user-agent header."
      },
      "Missing user-agent data raises suspicion under elevated traffic."
    );
  }

  if (snapshot.activeBlock) {
    riskScore = Math.max(riskScore, 90);
    reasons.push("An active temporary block is already in effect.");
  }

  return {
    riskScore,
    anomalies,
    reasons,
    recommendedBlock: riskScore >= 75
  };
}
