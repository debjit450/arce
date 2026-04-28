# Architecture Overview

ARCE is structured as a small distributed control plane for API traffic.

## Request Flow

```text
client request
   |
   v
/check-limit or /consume
   |
   v
request validation
   |
   v
behavior observation in Redis
   |
   v
abuse assessment
   |
   v
adaptive policy selection
   |
   v
algorithm enforcement via Redis Lua
   |
   v
metrics + anomaly recording
   |
   v
decision response
```

## Components

- `apps/server`: process entrypoint and server bootstrap
- `apps/dashboard`: static operator-facing dashboard assets
- `src/api`: HTTP wiring, route handlers, and request validation
- `src/core`: limiter orchestration, adaptive policy, and abuse detection
- `src/store`: Redis-backed persistence and Lua-enforced limiter state
- `src/sdk`: Node client and Express middleware integration
- `src/utils`: identity, hashing, and request/handler helpers
- `configs`: runtime configuration and shared constants

## Redis Responsibilities

- Limiter state for token bucket, leaky bucket, and sliding window
- Short-lived behavior counters used for burst and duplication analysis
- Temporary block records
- Aggregated metrics for the dashboard

## Concurrency Model

Limiter enforcement is the concurrency-sensitive path. Each algorithm is evaluated inside a Lua script so a distributed deployment can share Redis safely without race-prone read/modify/write logic in application code.
