# Design Decisions

## Why Redis

Rate limiting state must be shared across processes. Redis provides low-latency shared state, expiration semantics, and Lua execution in one operationally simple dependency.

## Why Lua For Enforcement

The limiter path needs atomicity under concurrency. Lua scripts avoid split reads and writes across network round-trips, which is where distributed limiters usually get incorrect.

## Why Separate Behavior Signals From Limiter State

The limit decision and abuse signals have different lifecycles:

- limiter state must be exact and algorithm-specific
- abuse signals are short-lived counters and fingerprints
- metrics are append-style operational summaries

Keeping them separate makes each path easier to reason about and change.

## Why Simple Statistical Detection Instead Of ML

ARCE is designed to be inspectable and operationally credible. Burst ratios, duplicate request patterns, route fan-out, and repeated denials are understandable signals that an engineer can tune without a training pipeline.

## Why A Minimal Dashboard

The dashboard is intentionally thin. Its job is to make the limiter observable during development and demos, not to become a full observability platform.

## Why The SDK Stays Small

The SDK and Express middleware are integration helpers, not an abstraction layer over the whole system. They exist to make adoption easy without hiding the HTTP API.
