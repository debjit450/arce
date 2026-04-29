# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] — 2026-04-29

### Security

- **API key authentication** — protected endpoints (`/check-limit`, `/consume`, `/api/dashboard-data`) now require a valid `x-api-key` header when `API_KEY` is configured. Authentication is disabled when the variable is empty, preserving the local development workflow.
- **Dashboard XSS fix** — replaced all `innerHTML` usage in the dashboard with safe DOM construction (`textContent` and `createElement`). User-controlled data can no longer execute scripts in the operator's browser.
- **Input length limits** — `userId` (max 256), `ip` (max 64), and `identifier` (max 256) fields now enforce maximum length to prevent memory exhaustion via oversized Redis keys.
- **Error handler hardened** — `ZodError` returns 400 with safe validation details. All other errors return a generic 500 without leaking internal messages or stack traces.
- **Security headers** — all responses now include `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and `Referrer-Policy`.

### Changed

- **Parallel I/O on hot path** — `recordOutcome` and `recordDecision` now execute via `Promise.all()` instead of sequential awaits, reducing latency by one Redis round-trip.
- **Graceful shutdown timeout** — the server now force-exits after 10 seconds if `server.close()` hangs on connection draining.
- **Redis reconnect strategy** — the Redis client now retries with exponential backoff (up to 10 attempts) instead of silently logging errors.

### Added

- **Comprehensive test suite** — added 50+ tests across 7 new test files:
  - Abuse detector edge cases and threshold boundaries
  - Schema validation for all `superRefine` rules and field constraints
  - Identity utility tests (all `resolveSubject` branches, `buildFingerprint` paths)
  - Hashing determinism and format tests
  - Time bucketing tests
  - Express middleware tests (allow, deny, error forwarding)
- **`.dockerignore`** — excludes dev-only files from the build context.
- **Docker hardening** — non-root user (`USER node`), `HEALTHCHECK` directive, `npm ci` for reproducible installs, only copies necessary runtime assets.
- **CI improvements** — added `format:check`, `typecheck`, `npm audit`, Redis service container, and Node 20 + 22 matrix testing.

## [1.0.0] — 2026-04-29

Initial release. Distributed adaptive traffic control with Redis-backed rate limiting, abuse detection, and operator dashboard.
