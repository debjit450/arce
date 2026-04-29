# Dashboard

This directory contains static assets for the ARCE operator dashboard.

The dashboard is intentionally lightweight. It visualizes request volume, rate-limited traffic, active blocks, and recent anomaly events without introducing a separate frontend build system.

**How to view it:**
You do not need to run a separate web server for the dashboard. The main ARCE Express server automatically serves these static assets at the `/dashboard` endpoint (e.g., `http://localhost:4000/dashboard`).
