import type {
  EffectivePolicy,
  LimiterDecision,
  RateLimitAlgorithm
} from "../types";
import type { RedisClient } from "./redis";

interface EvaluateLimiterArgs {
  subject: string;
  algorithm: RateLimitAlgorithm;
  policy: EffectivePolicy;
  cost: number;
  consume: boolean;
  nowMs: number;
  requestId: string;
}

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local consume = tonumber(ARGV[5])
local ttl_ms = tonumber(ARGV[6])

local tokens = tonumber(redis.call("HGET", key, "tokens"))
local updated_at = tonumber(redis.call("HGET", key, "updatedAt"))

if tokens == nil then
  tokens = capacity
end

if updated_at == nil then
  updated_at = now
end

local elapsed = math.max(0, now - updated_at)
tokens = math.min(capacity, tokens + (elapsed * refill_per_ms))

local allowed = 0
local remaining = tokens
local retry_after_ms = 0

if tokens >= cost then
  allowed = 1
  if consume == 1 then
    remaining = tokens - cost
  end
else
  retry_after_ms = math.ceil((cost - tokens) / refill_per_ms)
end

redis.call("HSET", key, "tokens", remaining, "updatedAt", now)
redis.call("PEXPIRE", key, ttl_ms)

local reset_after_ms = math.ceil((capacity - remaining) / refill_per_ms)
return { allowed, remaining, retry_after_ms, reset_after_ms }
`;

const LEAKY_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local leak_per_ms = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local consume = tonumber(ARGV[5])
local ttl_ms = tonumber(ARGV[6])

local level = tonumber(redis.call("HGET", key, "level"))
local updated_at = tonumber(redis.call("HGET", key, "updatedAt"))

if level == nil then
  level = 0
end

if updated_at == nil then
  updated_at = now
end

local elapsed = math.max(0, now - updated_at)
level = math.max(0, level - (elapsed * leak_per_ms))

local allowed = 0
local retry_after_ms = 0

if (level + cost) <= capacity then
  allowed = 1
  if consume == 1 then
    level = level + cost
  end
else
  retry_after_ms = math.ceil(((level + cost) - capacity) / leak_per_ms)
end

redis.call("HSET", key, "level", level, "updatedAt", now)
redis.call("PEXPIRE", key, ttl_ms)

local remaining = math.max(0, capacity - level)
local reset_after_ms = math.ceil(level / leak_per_ms)
return { allowed, remaining, retry_after_ms, reset_after_ms }
`;

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local consume = tonumber(ARGV[5])
local ttl_ms = tonumber(ARGV[6])
local request_id = ARGV[7]

redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window_ms)

local elements = redis.call("ZRANGE", key, 0, -1)
local current = 0
for _, elem in ipairs(elements) do
  -- elem format is "requestId:cost"
  local elem_cost = string.match(elem, ":(%d+)$")
  if elem_cost then
    current = current + tonumber(elem_cost)
  end
end

local allowed = 0
local retry_after_ms = 0

if (current + cost) <= limit then
  allowed = 1
  if consume == 1 then
    redis.call("ZADD", key, now, request_id .. ":" .. tostring(cost))
    current = current + cost
  end
else
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  if oldest[2] ~= nil then
    retry_after_ms = math.max(0, window_ms - (now - tonumber(oldest[2])))
  end
end


redis.call("PEXPIRE", key, ttl_ms)

local remaining = math.max(0, limit - current)
local reset_after_ms = 0
local oldest_after = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
if oldest_after[2] ~= nil then
  reset_after_ms = math.max(0, window_ms - (now - tonumber(oldest_after[2])))
end

return { allowed, remaining, retry_after_ms, reset_after_ms }
`;

export class RedisRateLimiterStore {
  constructor(
    private readonly client: RedisClient,
    private readonly prefix: string
  ) {}

  async evaluate(args: EvaluateLimiterArgs): Promise<LimiterDecision> {
    const key = `${this.prefix}:limit:${args.algorithm}:${args.subject}`;
    const ttlMs = Math.max(args.policy.windowMs * 2, 120_000);

    let raw: unknown;

    if (args.algorithm === "token_bucket") {
      raw = await this.client.eval(TOKEN_BUCKET_LUA, {
        keys: [key],
        arguments: [
          args.policy.capacity.toString(),
          args.policy.refillTokensPerMs.toString(),
          args.cost.toString(),
          args.nowMs.toString(),
          args.consume ? "1" : "0",
          ttlMs.toString()
        ]
      });
    } else if (args.algorithm === "leaky_bucket") {
      raw = await this.client.eval(LEAKY_BUCKET_LUA, {
        keys: [key],
        arguments: [
          args.policy.capacity.toString(),
          args.policy.leakRatePerMs.toString(),
          args.cost.toString(),
          args.nowMs.toString(),
          args.consume ? "1" : "0",
          ttlMs.toString()
        ]
      });
    } else {
      raw = await this.client.eval(SLIDING_WINDOW_LUA, {
        keys: [key],
        arguments: [
          args.policy.capacity.toString(),
          args.policy.windowMs.toString(),
          args.cost.toString(),
          args.nowMs.toString(),
          args.consume ? "1" : "0",
          ttlMs.toString(),
          args.requestId
        ]
      });
    }

    const [allowed, remaining, retryAfterMs, resetAfterMs] = raw as [
      number,
      number,
      number,
      number
    ];

    return {
      allowed: Boolean(allowed),
      remaining: Math.max(0, Math.floor(Number(remaining))),
      retryAfterMs: Math.max(0, Math.ceil(Number(retryAfterMs))),
      resetAfterMs: Math.max(0, Math.ceil(Number(resetAfterMs)))
    };
  }
}
