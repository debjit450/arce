# Adaptive Rate Control Engine (ARCE)

## Distributed Adaptive Traffic Control System

![Node >=20](https://img.shields.io/badge/node-%3E%3D20-43853d)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Redis 7+](https://img.shields.io/badge/redis-7%2B-red)

Static rate limits are easy to implement and easy to bypass.

The real problem starts when traffic is distributed, bursty, or intentionally abusive:

- a fixed threshold treats healthy spikes and scraping the same way
- per-process counters break under horizontal scaling
- race-prone Redis usage makes limits inaccurate under concurrency
- operators need visibility into why a subject was limited or blocked

ARCE is a TypeScript and Redis-based traffic control service built for that gap. It combines distributed limiter algorithms, Redis Lua atomicity, adaptive policy tiers, and practical abuse detection in a small system that is easy to inspect and run.

## Why ARCE

ARCE is built around the kinds of problems that show up in real API systems:

- shared limits across multiple application instances
- concurrency-safe updates under load
- policy changes based on observed behavior, not only static quotas
- explainable abuse signals instead of opaque "AI" claims
- a small integration surface for existing Node.js services

This repository is useful if you want to study or demonstrate:

- distributed rate limiting
- Redis-backed coordination
- Lua for atomic state transitions
- adaptive throttling
- abuse-aware API protection

## Core Capabilities

- Token bucket, sliding window, and leaky bucket algorithms behind one API
- Redis-backed distributed state for multi-instance deployments
- Lua-based atomic limiter evaluation for concurrency safety
- Adaptive policy tiers: `normal`, `elevated`, `suspicious`, `blocked`
- Abuse detection for bursts, repeated fingerprints, route scans, and repeated denials
- Express middleware and lightweight SDK for integration
- Minimal dashboard for request volume, anomalies, and active blocks

## Architecture Overview

```text
client
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
metrics and anomaly recording
  |
  v
decision response
```

Repository layout:

```text
apps/
  dashboard/     static dashboard assets
  server/        server bootstrap
configs/         runtime config and constants
docs/            architecture and design notes
scripts/         local smoke/dev utilities
src/
  api/           HTTP handlers and validation
  core/          limiter orchestration and policy logic
  sdk/           client and Express middleware
  store/         Redis and persistence logic
  types/         shared types
  utils/         helpers
tests/
  integration/   HTTP-level integration tests
  load/          k6 placeholder scripts
  unit/          policy and behavior unit tests
```

Additional design notes:

- [docs/architecture.md](./docs/architecture.md)
- [docs/design-decisions.md](./docs/design-decisions.md)
- [docs/system-diagram.md](./docs/system-diagram.md)

## Design Decisions

### Redis for distributed state

Limiter state is shared across instances. Redis gives ARCE a simple coordination layer with low-latency access and native expiry semantics.

### Lua for atomic enforcement

The limiter path is the correctness-critical path. Token bucket, leaky bucket, and sliding window decisions are executed inside Redis Lua scripts so ARCE does not rely on unsafe read-modify-write behavior across multiple network round-trips.

### Separate state by purpose

ARCE keeps:

- limiter state separate from
- behavior signals separate from
- metrics and dashboard summaries

This keeps the exactness-critical path small and makes the system easier to reason about.

### Simple, inspectable detection

ARCE does not pretend to be an ML system. It uses signals an operator can understand, tune, and defend:

- short-term burst versus recent baseline
- repeated identical request fingerprints
- wide route fan-out consistent with crawling
- repeated denials against the same subject

## Adaptive Logic

Each request starts with a baseline limit, then the policy engine adjusts that limit using recent behavior:

- `normal`: full configured limit
- `elevated`: reduced limit for subjects showing suspicious but not critical behavior
- `suspicious`: aggressive reduction when behavior strongly suggests abuse
- `blocked`: temporary block for critical patterns or persistent pressure against the limiter

Example progression:

- normal user: `100 req/min`
- repeated identical bursts: downgraded to `60 req/min` or lower
- strong abuse pattern: downgraded to `20 req/min` or lower
- repeated violations plus burst behavior: temporary block

The goal is not only to reject requests. It is to shape traffic proportionally before abuse becomes an outage.

## Abuse Detection

ARCE currently detects:

- burst spikes against a recent moving baseline
- repeated identical request fingerprints
- wide route scans within a short time window
- repeated denials from the same subject
- heavy traffic without a user-agent header

These are intentionally practical heuristics. They are simple enough to inspect, but useful enough to catch obvious bot, scraping, and threshold-hammering behavior.

## Performance Notes

ARCE is designed around predictable Redis interactions:

- limiter enforcement is a single Lua execution
- behavior writes use Redis pipelining via `MULTI`
- metrics recording uses separate lightweight Redis updates

This keeps the correctness-critical limiter path atomic while preserving visibility for operators.

The repository includes:

- unit tests for policy behavior
- HTTP integration tests for the server surface
- a minimal k6 load script in [tests/load/basic-smoke.js](./tests/load/basic-smoke.js)

No formal benchmark numbers are published yet. The current focus is correctness, inspectability, and clean extension points.

## Quick Start

### Prerequisites

- Node.js `>=20`
- Redis `7+`

### Run locally

```bash
npm install
docker compose up
npm run dev
```

Server:

```text
http://localhost:4000
```

Dashboard:

```text
http://localhost:4000/dashboard
```

If you need non-default settings, use the variables documented in [.env.example](./.env.example).

## Authentication

ARCE uses a shared API key for protecting its endpoints. The operator generates their own key and configures it via the `API_KEY` environment variable — there is no built-in key issuance system.

**Setup:**

1. Generate a key using any method you prefer:

```bash
# Example: generate a random 32-byte hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Set it in your `.env` file:

```env
API_KEY=your-generated-key-here
```

3. Pass the same key in the `x-api-key` header on every request to a protected endpoint:

```bash
curl -X POST http://localhost:4000/consume \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-generated-key-here" \
  -d '{"algorithm":"token_bucket","route":"/api/orders","method":"GET","ip":"203.0.113.8","scope":"ip"}'
```

When `API_KEY` is not set, authentication is disabled so local development remains frictionless.

Protected endpoints: `/check-limit`, `/consume`, `/api/dashboard-data`

Public endpoints (no key required): `/`, `/health`, `/dashboard`, `/static/*`

## API Example

Check a limit without consuming:

```bash
curl -X POST http://localhost:4000/check-limit \
  -H "Content-Type: application/json" \
  -d "{\"algorithm\":\"token_bucket\",\"route\":\"/api/orders\",\"method\":\"GET\",\"userId\":\"user-42\",\"ip\":\"203.0.113.8\",\"scope\":\"hybrid\"}"
```

Consume from the limiter:

```bash
curl -X POST http://localhost:4000/consume \
  -H "Content-Type: application/json" \
  -d "{\"algorithm\":\"sliding_window\",\"route\":\"/api/search\",\"method\":\"GET\",\"ip\":\"203.0.113.8\",\"scope\":\"ip\"}"
```

Example request shape:

```json
{
  "algorithm": "token_bucket",
  "route": "/api/orders",
  "method": "GET",
  "userId": "user-42",
  "ip": "203.0.113.8",
  "scope": "hybrid",
  "cost": 1,
  "fingerprint": "GET:/api/orders?status=open",
  "baseLimitPerMinute": 100,
  "metadata": {
    "userAgent": "curl/8.6.0"
  }
}
```

## SDK Example

```ts
import { ArceClient } from "./src/sdk/client";

const client = new ArceClient({
  baseUrl: "http://localhost:4000",
  headers: { "x-api-key": process.env.ARCE_API_KEY ?? "" }
});

const decision = await client.consume({
  algorithm: "token_bucket",
  route: "/api/orders",
  method: "POST",
  userId: "user-42",
  ip: "203.0.113.8",
  scope: "hybrid"
});

if (!decision.allowed) {
  console.log(`retry in ${decision.decision.retryAfterMs}ms`);
}
```

## Express Middleware Example

```ts
import express from "express";
import { ArceClient } from "./src/sdk/client";
import { createArceMiddleware } from "./src/sdk/express-middleware";

const app = express();
const client = new ArceClient({ baseUrl: "http://localhost:4000" });

app.use(
  createArceMiddleware({
    client,
    algorithm: "token_bucket",
    scope: "hybrid",
    resolveUserId: (req) => req.header("x-user-id") ?? undefined
  })
);
```

## Production Integration Notes

- Put ARCE behind your API tier or call it from application middleware.
- Use a stable subject key strategy: user, IP, or hybrid depending on your threat model.
- Keep route fingerprinting intentional. High-cardinality fingerprints reduce the value of duplicate detection.
- Tune baseline limits and block durations per environment.

## Configuration

| Variable                      | Default                  | Purpose                                                          |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `PORT`                        | `4000`                   | HTTP port for the ARCE server                                    |
| `REDIS_URL`                   | `redis://localhost:6379` | Redis connection string                                          |
| `SERVICE_NAME`                | `arce`                   | Prefix for Redis keys                                            |
| `API_KEY`                     | _(empty, auth disabled)_ | API key for protecting `/check-limit`, `/consume`, and dashboard |
| `DEFAULT_LIMIT_PER_MINUTE`    | `100`                    | Baseline limit for normal traffic                                |
| `SUSPICIOUS_LIMIT_PER_MINUTE` | `20`                     | Lower bound for suspicious traffic                               |
| `BLOCK_DURATION_SECONDS`      | `300`                    | Temporary block duration for critical abuse patterns             |

## Development

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run smoke
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution and PR expectations.
See [CHANGELOG.md](./CHANGELOG.md) for a history of changes.

## Roadmap

- Add richer integration tests against a real Redis instance
- Add clearer operator tuning guidance for behavior thresholds
- Add framework-specific examples for production adoption
- Expand load test coverage beyond the included smoke script

## License

[MIT](./LICENSE)
