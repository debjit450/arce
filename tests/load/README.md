# Load Tests

`basic-smoke.js` is a minimal k6 script intended as a starting point for repeatable load validation.

> **Note:** Running this script requires [k6](https://k6.io/docs/get-started/installation/) to be installed on your system.

Example:

```bash
k6 run tests/load/basic-smoke.js
```

If you don't have k6 installed and just want a quick connectivity check, use the zero-dependency smoke test instead:

```bash
npm run smoke
```

The script is intentionally lightweight. It exercises the `/consume` path and leaves deeper workload modeling to future contributors.
