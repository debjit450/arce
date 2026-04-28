import { randomUUID } from "node:crypto";

import {
  ACTIVE_BLOCK_LIMIT,
  FIVE_MINUTES_MS,
  TEN_MINUTES_MS,
  TEN_SECONDS_MS,
  TWENTY_MINUTES_MS,
  TWO_HOURS_MS
} from "../../configs/constants";

import type {
  ActiveBlockSummary,
  BehaviorEvent,
  BehaviorSnapshot
} from "../types";
import type { RedisClient } from "./redis";
import { hashValue } from "../utils/hashing";
import { bucketStart } from "../utils/time";

interface OutcomeArgs {
  allowed: boolean;
  blocked: boolean;
  timestampMs: number;
}

function sumBuckets(
  entries: Record<string, string>,
  thresholdMs: number
): number {
  return Object.entries(entries).reduce((total, [bucket, value]) => {
    return Number(bucket) >= thresholdMs ? total + Number(value) : total;
  }, 0);
}

function averagePreviousTenSecondBuckets(
  entries: Record<string, string>,
  nowMs: number
): number {
  const current = bucketStart(nowMs, TEN_SECONDS_MS);
  const values: number[] = [];

  for (let offset = 1; offset <= 5; offset += 1) {
    const bucket = current - offset * TEN_SECONDS_MS;
    values.push(Number(entries[bucket.toString()] ?? 0));
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export class BehaviorStore {
  constructor(
    private readonly client: RedisClient,
    private readonly prefix: string
  ) {}

  private keys(subject: string) {
    return {
      requestTenSecond: `${this.prefix}:behavior:req10s:${subject}`,
      fingerprints: `${this.prefix}:behavior:fingerprint:${subject}`,
      routes: `${this.prefix}:behavior:route:${subject}`,
      denials: `${this.prefix}:behavior:denials:${subject}`,
      missingUserAgent: `${this.prefix}:behavior:missing-ua:${subject}`,
      block: `${this.prefix}:block:${subject}`,
      blocks: `${this.prefix}:blocks`,
      blockMeta: `${this.prefix}:blocks:meta`
    };
  }

  async observe(
    subject: string,
    event: BehaviorEvent
  ): Promise<BehaviorSnapshot> {
    const keys = this.keys(subject);
    const tenSecondBucket = bucketStart(
      event.timestampMs,
      TEN_SECONDS_MS
    ).toString();
    const minuteBucket = bucketStart(event.timestampMs, 60_000).toString();
    const fingerprintHash = hashValue(event.fingerprint);
    const routeHash = hashValue(event.route);

    const write = this.client.multi();
    write.hIncrBy(keys.requestTenSecond, tenSecondBucket, 1);
    write.pExpire(keys.requestTenSecond, TWENTY_MINUTES_MS);
    write.hIncrBy(keys.fingerprints, `${minuteBucket}:${fingerprintHash}`, 1);
    write.pExpire(keys.fingerprints, TEN_MINUTES_MS);
    write.hIncrBy(keys.routes, `${minuteBucket}:${routeHash}`, 1);
    write.pExpire(keys.routes, TEN_MINUTES_MS);

    if (!event.userAgent) {
      write.hIncrBy(keys.missingUserAgent, minuteBucket, 1);
      write.pExpire(keys.missingUserAgent, TEN_MINUTES_MS);
    }

    await write.exec();

    const [
      requestBuckets,
      fingerprintBuckets,
      routeBuckets,
      denialBuckets,
      missingUserAgentBuckets,
      blockReason,
      blockTtlMs
    ] = await Promise.all([
      this.client.hGetAll(keys.requestTenSecond),
      this.client.hGetAll(keys.fingerprints),
      this.client.hGetAll(keys.routes),
      this.client.hGetAll(keys.denials),
      this.client.hGetAll(keys.missingUserAgent),
      this.client.get(keys.block),
      this.client.pTTL(keys.block)
    ]);

    const recentTenSecondCount = sumBuckets(
      requestBuckets,
      event.timestampMs - TEN_SECONDS_MS
    );
    const trailingMinuteCount = sumBuckets(
      requestBuckets,
      event.timestampMs - 60_000
    );
    const averageTenSecondCount = averagePreviousTenSecondBuckets(
      requestBuckets,
      event.timestampMs
    );
    const duplicateFingerprintCount = Object.entries(fingerprintBuckets).reduce(
      (total, [field, value]) => {
        const [bucket, storedHash] = field.split(":");
        if (
          storedHash === fingerprintHash &&
          Number(bucket) >= event.timestampMs - 60_000
        ) {
          return total + Number(value);
        }

        return total;
      },
      0
    );
    const duplicateFingerprintRatio =
      trailingMinuteCount > 0
        ? duplicateFingerprintCount / trailingMinuteCount
        : 0;
    const uniqueRouteCount = new Set(
      Object.keys(routeBuckets)
        .filter(
          (field) => Number(field.split(":")[0]) >= event.timestampMs - 60_000
        )
        .map((field) => field.split(":")[1])
    ).size;
    const deniedLastFiveMinutes = sumBuckets(
      denialBuckets,
      event.timestampMs - FIVE_MINUTES_MS
    );
    const missingUserAgentCount = sumBuckets(
      missingUserAgentBuckets,
      event.timestampMs - 60_000
    );

    return {
      recentTenSecondCount,
      trailingMinuteCount,
      averageTenSecondCount,
      duplicateFingerprintCount,
      duplicateFingerprintRatio,
      uniqueRouteCount,
      deniedLastFiveMinutes,
      missingUserAgentCount,
      activeBlock:
        blockTtlMs > 0
          ? {
              reason: blockReason ?? "Temporary block",
              ttlMs: blockTtlMs,
              expiresAtMs: event.timestampMs + blockTtlMs
            }
          : null
    };
  }

  async recordOutcome(subject: string, outcome: OutcomeArgs): Promise<void> {
    if (outcome.allowed) {
      return;
    }

    const keys = this.keys(subject);
    const minuteBucket = bucketStart(outcome.timestampMs, 60_000).toString();
    const write = this.client.multi();
    write.hIncrBy(keys.denials, minuteBucket, 1);
    write.pExpire(keys.denials, TWO_HOURS_MS);
    await write.exec();
  }

  async registerBlock(
    subject: string,
    reason: string,
    durationSeconds: number
  ): Promise<void> {
    const keys = this.keys(subject);
    const nowMs = Date.now();
    const ttlMs = durationSeconds * 1_000;
    const metadata = JSON.stringify({
      reason,
      expiresAtMs: nowMs + ttlMs,
      id: randomUUID()
    });

    const write = this.client.multi();
    write.set(keys.block, reason, {
      PX: ttlMs
    });
    write.zAdd(keys.blocks, [
      {
        score: nowMs + ttlMs,
        value: subject
      }
    ]);
    write.hSet(keys.blockMeta, subject, metadata);
    await write.exec();
  }

  async getActiveBlocks(
    limit = ACTIVE_BLOCK_LIMIT
  ): Promise<ActiveBlockSummary[]> {
    const nowMs = Date.now();
    const blocksKey = `${this.prefix}:blocks`;
    const blockMetaKey = `${this.prefix}:blocks:meta`;
    const expired = await this.client.sendCommand([
      "ZRANGEBYSCORE",
      blocksKey,
      "-inf",
      nowMs.toString()
    ]);

    if (Array.isArray(expired) && expired.length > 0) {
      const cleanup = this.client.multi();
      cleanup.zRem(blocksKey, expired as string[]);
      cleanup.hDel(blockMetaKey, expired as string[]);
      await cleanup.exec();
    }

    const raw = await this.client.sendCommand([
      "ZRANGEBYSCORE",
      blocksKey,
      nowMs.toString(),
      "+inf",
      "WITHSCORES",
      "LIMIT",
      "0",
      limit.toString()
    ]);

    if (!Array.isArray(raw) || raw.length === 0) {
      return [];
    }

    const subjects: string[] = [];
    const scoreBySubject = new Map<string, number>();

    for (let index = 0; index < raw.length; index += 2) {
      const subject = raw[index] as string;
      const score = Number(raw[index + 1]);
      subjects.push(subject);
      scoreBySubject.set(subject, score);
    }

    const metadataList =
      subjects.length > 0
        ? await this.client.hmGet(blockMetaKey, subjects)
        : [];

    return subjects.map((subject, index) => {
      const metadata = metadataList[index]
        ? JSON.parse(metadataList[index] as string)
        : null;
      const expiresAtMs = scoreBySubject.get(subject) ?? nowMs;
      return {
        subject,
        reason: metadata?.reason ?? "Temporary block",
        expiresAt: new Date(expiresAtMs).toISOString(),
        ttlMs: Math.max(0, expiresAtMs - nowMs)
      };
    });
  }
}
