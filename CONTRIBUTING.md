# Contributing

ARCE is intentionally focused. Contributions should improve reliability, clarity, or operator usability without turning the project into a generic API gateway.

## Local Setup

1. Install Node.js `>=20`.
2. Install dependencies:

```bash
npm install
```

3. Start Redis:

```bash
docker compose up
```

4. Start the server:

```bash
npm run dev
```

5. Optional smoke check:

```bash
npm run smoke
```

## Useful Commands

```bash
npm run build
npm run typecheck
npm run lint
npm run test
npm run format:check
```

## Coding Standards

- Keep the core system focused on rate limiting, adaptive control, and abuse detection.
- Prefer small composable modules over large framework-style abstractions.
- Treat Redis operations as concurrency-sensitive code paths. Atomicity claims should be explicit and justified.
- Do not add speculative infrastructure features.
- Keep public APIs and config changes documented in `README.md` and `docs/`.

## Pull Request Guidelines

- Open an issue first for large changes or behavioral changes.
- Keep PRs scoped. Separate refactors from behavioral changes when possible.
- Add or update tests for code that changes behavior.
- Include a short note on risk: what changed, what could regress, and how you verified it.
- Run `npm run build`, `npm run lint`, and `npm run test` before submitting.

## Documentation Expectations

If you change:

- API behavior: update `README.md`
- system design: update `docs/architecture.md` or `docs/design-decisions.md`
- configuration: update `.env.example` and the configuration section in `README.md`
