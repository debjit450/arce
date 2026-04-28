# Load Tests

`basic-smoke.js` is a minimal k6 script intended as a starting point for repeatable load validation.

Example:

```bash
k6 run tests/load/basic-smoke.js
```

The script is intentionally lightweight. It exercises the `/consume` path and leaves deeper workload modeling to future contributors.
