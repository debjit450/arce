import {
  DASHBOARD_SERIES_POINTS,
  RECENT_ANOMALY_LIMIT,
  TWENTY_FOUR_HOURS_MS
} from "../../configs/constants";
import type {
  DashboardPoint,
  DashboardSnapshot,
  EnforcementResult
} from "../types";
import type { RedisClient } from "./redis";
import { bucketStart } from "../utils/time";

function readBucket(entries: Record<string, string>, bucket: number): number {
  return Number(entries[bucket.toString()] ?? 0);
}

export class MetricsStore {
  constructor(
    private readonly client: RedisClient,
    private readonly prefix: string
  ) {}

  private keys() {
    return {
      totals: `${this.prefix}:metrics:totals`,
      requests: `${this.prefix}:metrics:req`,
      blocked: `${this.prefix}:metrics:blocked`,
      rateLimited: `${this.prefix}:metrics:rate-limited`,
      anomalies: `${this.prefix}:metrics:anomalies`,
      recentAnomalies: `${this.prefix}:metrics:recent-anomalies`
    };
  }

  async recordDecision(result: EnforcementResult): Promise<void> {
    const keys = this.keys();
    const nowMs = Date.now();
    const minuteBucket = bucketStart(nowMs).toString();
    const write = this.client.multi();

    write.hIncrBy(keys.totals, "requests", 1);
    write.hIncrBy(keys.requests, minuteBucket, 1);
    write.pExpire(keys.requests, TWENTY_FOUR_HOURS_MS);

    if (result.allowed) {
      write.hIncrBy(keys.totals, "allowed", 1);
    } else {
      write.hIncrBy(keys.totals, "rateLimited", 1);
      write.hIncrBy(keys.rateLimited, minuteBucket, 1);
      write.pExpire(keys.rateLimited, TWENTY_FOUR_HOURS_MS);
    }

    if (result.blocked) {
      write.hIncrBy(keys.totals, "blocked", 1);
      write.hIncrBy(keys.blocked, minuteBucket, 1);
      write.pExpire(keys.blocked, TWENTY_FOUR_HOURS_MS);
    }

    if (result.anomalies.length > 0) {
      write.hIncrBy(keys.totals, "anomalies", 1);
      write.hIncrBy(keys.anomalies, minuteBucket, 1);
      write.pExpire(keys.anomalies, TWENTY_FOUR_HOURS_MS);
      write.lPush(
        keys.recentAnomalies,
        JSON.stringify({
          timestamp: result.evaluatedAt,
          subject: result.subject,
          tier: result.effectivePolicy.tier,
          riskScore: result.effectivePolicy.riskScore,
          reasons: result.effectivePolicy.reasons,
          anomalies: result.anomalies
        })
      );
      write.lTrim(keys.recentAnomalies, 0, RECENT_ANOMALY_LIMIT - 1);
    }

    await write.exec();
  }

  async getDashboardMetrics(): Promise<
    Omit<DashboardSnapshot, "activeBlocks">
  > {
    const keys = this.keys();
    const [
      totals,
      requestBuckets,
      blockedBuckets,
      rateLimitedBuckets,
      anomalyBuckets,
      recentAnomaliesRaw
    ] = await Promise.all([
      this.client.hGetAll(keys.totals),
      this.client.hGetAll(keys.requests),
      this.client.hGetAll(keys.blocked),
      this.client.hGetAll(keys.rateLimited),
      this.client.hGetAll(keys.anomalies),
      this.client.lRange(keys.recentAnomalies, 0, RECENT_ANOMALY_LIMIT - 1)
    ]);

    const series: DashboardPoint[] = [];
    const nowBucket = bucketStart(Date.now());

    for (let offset = DASHBOARD_SERIES_POINTS - 1; offset >= 0; offset -= 1) {
      const bucket = nowBucket - offset * 60_000;
      series.push({
        timestamp: new Date(bucket).toISOString(),
        requests: readBucket(requestBuckets, bucket),
        blocked: readBucket(blockedBuckets, bucket),
        rateLimited: readBucket(rateLimitedBuckets, bucket),
        anomalies: readBucket(anomalyBuckets, bucket)
      });
    }

    return {
      totals: {
        requests: Number(totals.requests ?? 0),
        allowed: Number(totals.allowed ?? 0),
        rateLimited: Number(totals["rateLimited"] ?? 0),
        blocked: Number(totals.blocked ?? 0),
        anomalies: Number(totals.anomalies ?? 0)
      },
      recentSeries: series,
      recentAnomalies: recentAnomaliesRaw.map((item) => JSON.parse(item))
    };
  }
}
