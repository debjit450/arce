# ARCE System Diagram

This document translates the current codebase into diagrams that are useful for design reviews, demos, and onboarding.

It is based on the implementation in:

- `apps/server/main.ts`
- `src/api/*`
- `src/core/*`
- `src/store/*`
- `src/sdk/*`
- `apps/dashboard/public/*`
- `configs/*`
- `.github/workflows/ci.yml`

## 1. End-to-End System Overview

```mermaid
flowchart TB
  subgraph Actors["External Actors"]
    ApiClients["API clients"]
    HostApps["Node/Express apps using ARCE"]
    Operators["Operators using the dashboard"]
    Developers["Developers and CI"]
  end

  subgraph Integration["Integration Surface"]
    SDK["ArceClient<br/>src/sdk/client.ts"]
    Middleware["createArceMiddleware<br/>src/sdk/express-middleware.ts"]
  end

  subgraph Runtime["ARCE Server Runtime"]
    Bootstrap["Bootstrap<br/>apps/server/main.ts"]
    App["Express app<br/>src/api/app.ts"]
    Root["GET /"]
    Health["GET /health"]
    Check["POST /check-limit"]
    Consume["POST /consume"]
    Dashboard["GET /dashboard"]
    DashboardData["GET /api/dashboard-data"]
    StaticAssets["Dashboard static files<br/>apps/dashboard/public/*"]
    Schema["Zod request validation<br/>src/api/schemas.ts"]
    Service["LimiterService"]
    Detector["AbuseDetector<br/>analyzeBehavior()"]
    Policy["AdaptivePolicy<br/>buildEffectivePolicy()"]
    BehaviorStore["BehaviorStore"]
    LimiterStore["RedisRateLimiterStore"]
    MetricsStore["MetricsStore"]
    Snapshot["getDashboardSnapshot()"]
  end

  subgraph RedisLayer["Redis Shared State"]
    RedisServer["Redis 7 server"]
    LimitState["Limiter state<br/>arce:limit:*"]
    BehaviorCounters["Behavior counters<br/>req10s / fingerprint / route / missing-ua"]
    DenialHistory["Denial history<br/>arce:behavior:denials:*"]
    BlockState["Block TTLs and indexes<br/>arce:block:* / arce:blocks*"]
    MetricState["Metric totals and minute buckets<br/>arce:metrics:*"]
    RecentAnomalyState["Recent anomaly feed"]
  end

  subgraph Tooling["Configuration, Delivery, and Validation"]
    Env[".env + configs/runtime.ts"]
    Compose["docker-compose.yml"]
    Docker["Dockerfile"]
    Tests["Vitest / Supertest / smoke tests"]
    CI["GitHub Actions CI"]
    Dist["Compiled dist/* output"]
  end

  ApiClients -->|direct HTTP| App
  ApiClients -->|Node integration| SDK
  HostApps --> Middleware
  Middleware -->|build payload + consume| SDK
  SDK -->|POST JSON| App

  Operators -->|open page| Dashboard
  Operators -->|poll data| DashboardData

  Developers -->|npm run dev / start| Bootstrap
  Developers -->|npm test / smoke| Tests
  CI -->|npm ci, build, lint, test| Tests
  Docker --> Dist
  Dist --> Bootstrap
  Compose --> RedisServer
  Env --> Bootstrap

  Bootstrap --> App
  Bootstrap --> BehaviorStore
  Bootstrap --> LimiterStore
  Bootstrap --> MetricsStore
  Bootstrap --> RedisServer

  App --> Root
  App --> Health
  App --> Check
  App --> Consume
  App --> Dashboard
  App --> DashboardData
  Dashboard --> StaticAssets

  Check --> Schema
  Consume --> Schema
  Schema --> Service

  Service --> BehaviorStore
  BehaviorStore --> RedisServer
  RedisServer --> BehaviorCounters
  RedisServer --> DenialHistory
  RedisServer --> BlockState

  Service --> Detector
  Detector --> Policy
  Policy -->|tier and limit| Service
  Policy -->|blocked tier| BehaviorStore

  Service --> LimiterStore
  LimiterStore -->|Lua enforcement| RedisServer
  RedisServer --> LimitState

  Service --> MetricsStore
  MetricsStore --> RedisServer
  RedisServer --> MetricState
  RedisServer --> RecentAnomalyState

  DashboardData --> Snapshot
  Snapshot --> MetricsStore
  Snapshot --> BehaviorStore
```

## 2. Request Lifecycle

This sequence shows the hot path for `POST /consume`.

```mermaid
sequenceDiagram
  participant Caller as Caller
  participant Client as ArceClient or direct HTTP client
  participant API as limit handler
  participant Schema as Zod schema
  participant Service as LimiterService
  participant Behavior as BehaviorStore
  participant Redis as Redis
  participant Detector as AbuseDetector
  participant Policy as AdaptivePolicy
  participant Limiter as RedisRateLimiterStore
  participant Metrics as MetricsStore

  Caller->>Client: send subject + route + algorithm
  Client->>API: POST /consume
  API->>Schema: validate request body
  Schema-->>API: normalized payload
  API->>Service: evaluate(payload, true)

  Service->>Behavior: observe(subject, event)
  Behavior->>Redis: update counters and read recent state
  Redis-->>Behavior: behavior snapshot
  Behavior-->>Service: recent behavior

  Service->>Detector: analyzeBehavior(snapshot)
  Detector-->>Service: risk score + anomalies
  Service->>Policy: buildEffectivePolicy(...)
  Policy-->>Service: tier + effective limit

  alt active block already exists
    Service->>Behavior: recordOutcome(denied)
  else blocked tier recommended
    Service->>Behavior: registerBlock(subject, reason, ttl)
    Service->>Behavior: recordOutcome(denied)
  else enforce adaptive limit
    Service->>Limiter: evaluate(subject, algorithm, policy, cost, consume)
    Limiter->>Redis: execute Lua script atomically
    Redis-->>Limiter: allowed, remaining, retry, reset
    Limiter-->>Service: limiter decision
    Service->>Behavior: recordOutcome(allowed or denied)
  end

  Service->>Metrics: recordDecision(result)
  Metrics->>Redis: update totals, minute buckets, anomaly feed
  Service-->>API: EnforcementResult
  API-->>Caller: 200 or 429 JSON
```

## 3. Redis Responsibility Map

This diagram shows how Redis is partitioned by responsibility instead of treating every key as one blob of rate-limiter state.

```mermaid
flowchart LR
  BehaviorStore["BehaviorStore"] --> Req10s["arce:behavior:req10s:[subject]<br/>10-second volume buckets"]
  BehaviorStore --> Fingerprints["arce:behavior:fingerprint:[subject]<br/>per-minute duplicate fingerprints"]
  BehaviorStore --> Routes["arce:behavior:route:[subject]<br/>per-minute route fan-out"]
  BehaviorStore --> Denials["arce:behavior:denials:[subject]<br/>recent denials"]
  BehaviorStore --> MissingUa["arce:behavior:missing-ua:[subject]<br/>missing user-agent counts"]
  BehaviorStore --> LiveBlock["arce:block:[subject]<br/>temporary block TTL"]
  BehaviorStore --> BlockIndex["arce:blocks and arce:blocks:meta<br/>active block index and metadata"]

  LimiterStore["RedisRateLimiterStore"] --> Token["token bucket state<br/>tokens + updatedAt"]
  LimiterStore --> Leaky["leaky bucket state<br/>level + updatedAt"]
  LimiterStore --> Sliding["sliding window state<br/>sorted set of request timestamps"]

  MetricsStore["MetricsStore"] --> Totals["arce:metrics:totals<br/>global counters"]
  MetricsStore --> Series["arce:metrics:req / blocked / rate-limited / anomalies<br/>minute series"]
  MetricsStore --> Recent["arce:metrics:recent-anomalies<br/>dashboard event feed"]
```

## 4. Build, Run, and Verify Path

```mermaid
flowchart LR
  Source["TypeScript source<br/>apps / src / configs"] --> Build["npm run build<br/>tsc"]
  Build --> Dist["dist/* compiled JavaScript"]
  Dist --> Start["node dist/apps/server/main.js"]
  Start --> Runtime["ARCE server process"]
  Redis["redis:7 via docker-compose"] --> Runtime
  Env[".env settings"] --> Runtime

  Dev["Developer"] -->|npm run dev| Runtime
  Dev -->|npm test| TestSuite["Vitest + Supertest"]
  Dev -->|npm run smoke| Smoke["scripts/smoke-test.mjs"]

  CI[".github/workflows/ci.yml"] --> Install["npm ci"]
  Install --> CIBuild["npm run build"]
  CIBuild --> Lint["npm run lint"]
  Lint --> CITest["npm test"]
```

## Reading Guide

- Use diagram 1 when you need the full system picture.
- Use diagram 2 when you need to explain exactly how one rate-limit decision is produced.
- Use diagram 3 when you need to reason about Redis data ownership and lifecycle.
- Use diagram 4 when you need to explain developer workflow, packaging, and CI.
