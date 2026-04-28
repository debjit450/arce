export type RateLimitAlgorithm =
  | "token_bucket"
  | "sliding_window"
  | "leaky_bucket";

export type ScopeMode = "user" | "ip" | "hybrid" | "custom";

export type PolicyTier = "normal" | "elevated" | "suspicious" | "blocked";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface LimitRequestPayload {
  algorithm: RateLimitAlgorithm;
  route: string;
  method: string;
  userId?: string;
  ip?: string;
  identifier?: string;
  scope?: ScopeMode;
  fingerprint?: string;
  cost?: number;
  baseLimitPerMinute?: number;
  metadata?: {
    userAgent?: string;
  };
}

export interface BehaviorEvent {
  route: string;
  fingerprint: string;
  userAgent?: string;
  timestampMs: number;
}

export interface ActiveBlock {
  reason: string;
  ttlMs: number;
  expiresAtMs: number;
}

export interface BehaviorSnapshot {
  recentTenSecondCount: number;
  trailingMinuteCount: number;
  averageTenSecondCount: number;
  duplicateFingerprintCount: number;
  duplicateFingerprintRatio: number;
  uniqueRouteCount: number;
  deniedLastFiveMinutes: number;
  missingUserAgentCount: number;
  activeBlock: ActiveBlock | null;
}

export interface AnomalyFlag {
  code: string;
  severity: AnomalySeverity;
  detail: string;
}

export interface AbuseAssessment {
  riskScore: number;
  anomalies: AnomalyFlag[];
  reasons: string[];
  recommendedBlock: boolean;
}

export interface EffectivePolicy {
  algorithm: RateLimitAlgorithm;
  tier: PolicyTier;
  baseLimitPerMinute: number;
  effectiveLimitPerMinute: number;
  capacity: number;
  windowMs: number;
  refillTokensPerMs: number;
  leakRatePerMs: number;
  riskScore: number;
  reasons: string[];
  blockDurationSeconds: number;
}

export interface LimiterDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  resetAfterMs: number;
}

export interface EnforcementResult {
  mode: "check" | "consume";
  allowed: boolean;
  blocked: boolean;
  subject: string;
  fingerprint: string;
  algorithm: RateLimitAlgorithm;
  cost: number;
  anomalies: AnomalyFlag[];
  behavior: BehaviorSnapshot;
  effectivePolicy: EffectivePolicy;
  decision: LimiterDecision;
  evaluatedAt: string;
}

export interface ActiveBlockSummary {
  subject: string;
  reason: string;
  expiresAt: string;
  ttlMs: number;
}

export interface DashboardPoint {
  timestamp: string;
  requests: number;
  blocked: number;
  rateLimited: number;
  anomalies: number;
}

export interface DashboardSnapshot {
  totals: {
    requests: number;
    allowed: number;
    rateLimited: number;
    blocked: number;
    anomalies: number;
  };
  recentSeries: DashboardPoint[];
  activeBlocks: ActiveBlockSummary[];
  recentAnomalies: Array<{
    timestamp: string;
    subject: string;
    tier: PolicyTier;
    riskScore: number;
    reasons: string[];
    anomalies: AnomalyFlag[];
  }>;
}
