# REQUIREMENTS.md

## Format

| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| REQ-01 | HTTP server listens on configurable `HOST:PORT` (default `127.0.0.1:3000`) | Goal 1 | Pending |
| REQ-02 | Accept requests from Claude Code and forward to OpenRouter preserving method, path, body, and relevant headers | Goal 1 | Pending |
| REQ-03 | Authenticate local requests using `ROUTER_TOKEN` environment variable; reject invalid tokens with 401 | Goal 4 | Pending |
| REQ-04 | Forward requests to configurable `OPENROUTER_BASE_URL` with appropriate OpenRouter authorization | Goal 1 | Pending |
| REQ-05 | Preserve streaming responses without unnecessary buffering | Goal 2 | Pending |
| REQ-06 | Support long-running requests with configurable timeout (`REQUEST_TIMEOUT_MS`, default 120000) | Goal 2 | Pending |
| REQ-07 | Preserve upstream response status codes, headers, and body | Goal 1 | Pending |
| REQ-08 | `GET /health` returns service name, status, uptime, and credential count | Goal 5 | Pending |
| REQ-09 | Load credentials from `OPENROUTER_KEY_1` through `OPENROUTER_KEY_20` env vars; ignore empty values | Goal 3 | Pending |
| REQ-10 | Track credential health in memory with configurable cooldown (`KEY_COOLDOWN_MS`, default 30000) | Goal 3 | Pending |
| REQ-11 | Failover to alternate credential on transient errors (connection failure, timeout, 408, 500, 502, 503, 504) | Goal 3 | Pending |
| REQ-12 | Maximum one alternate credential attempt per request (no infinite retries) | Goal 3 | Pending |
| REQ-13 | HTTP 429 returns upstream response to Claude Code — no credential rotation | Goal 3 | Pending |
| REQ-14 | Never expose API keys through any endpoint, log, or response | Goal 4 | Pending |
| REQ-15 | Never log Authorization headers, API keys, or sensitive request content | Goal 4 | Pending |
| REQ-16 | Structured logging with timestamp, method, path, status, credential ID, latency, failover events | Goal 5 | Pending |
| REQ-17 | Bind to `127.0.0.1` by default; do not expose publicly | Goal 4 | Pending |
| REQ-18 | `.env` git-ignored; `.env.example` contains only placeholders | Goal 4 | Pending |
| REQ-19 | Test suite covering all 12 specified test scenarios | Goal 1-5 | Pending |
| REQ-20 | README.md with complete documentation (15 sections) | Goal 5 | Pending |
| REQ-21 | `docs/architecture.md` with diagrams and flow descriptions | Goal 5 | Pending |
| REQ-22 | Package scripts: `start`, `dev`, `test` | Goal 1 | Pending |
