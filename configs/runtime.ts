import dotenv from "dotenv";

dotenv.config();

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const runtimeConfig = {
  isProduction: process.env.NODE_ENV === "production",
  port: readNumber("PORT", 4000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  serviceName: process.env.SERVICE_NAME ?? "arce",
  apiKey: process.env.API_KEY ?? "",
  defaultLimitPerMinute: readNumber("DEFAULT_LIMIT_PER_MINUTE", 100),
  suspiciousLimitPerMinute: readNumber("SUSPICIOUS_LIMIT_PER_MINUTE", 20),
  blockDurationSeconds: readNumber("BLOCK_DURATION_SECONDS", 300),
  abuse: {
    burstSpikeCount: readNumber("ABUSE_BURST_SPIKE_COUNT", 15),
    burstSpikeRatio: readNumber("ABUSE_BURST_SPIKE_RATIO", 3),
    duplicateFingerprintCount: readNumber("ABUSE_DUPLICATE_FINGERPRINT_COUNT", 8),
    duplicateFingerprintRatio: readNumber("ABUSE_DUPLICATE_FINGERPRINT_RATIO", 0.7),
    wideRouteScanCount: readNumber("ABUSE_WIDE_ROUTE_SCAN_COUNT", 12),
    wideRouteScanMinuteCount: readNumber("ABUSE_WIDE_ROUTE_SCAN_MINUTE_COUNT", 30),
    repeatedDenialsCount: readNumber("ABUSE_REPEATED_DENIALS_COUNT", 5),
    missingUserAgentCount: readNumber("ABUSE_MISSING_USER_AGENT_COUNT", 10),
  }
};
