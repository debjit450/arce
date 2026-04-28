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
  port: readNumber("PORT", 4000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  serviceName: process.env.SERVICE_NAME ?? "arce",
  defaultLimitPerMinute: readNumber("DEFAULT_LIMIT_PER_MINUTE", 100),
  suspiciousLimitPerMinute: readNumber("SUSPICIOUS_LIMIT_PER_MINUTE", 20),
  blockDurationSeconds: readNumber("BLOCK_DURATION_SECONDS", 300)
};
