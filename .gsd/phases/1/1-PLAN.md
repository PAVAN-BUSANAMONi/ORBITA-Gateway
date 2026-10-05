---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Configuration & Logger

## Objective
Create the configuration system that loads and validates all environment variables, and the structured logger that safely outputs request/event data without exposing secrets.

## Context
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- .gsd/DECISIONS.md (ADR-001: minimal deps, ADR-005: credential ID logging)

## Tasks

<task type="auto">
  <name>Create src/config.js</name>
  <files>src/config.js</files>
  <action>
    Create a configuration module that:

    1. Requires and calls `dotenv/config` at the top
    2. Exports a frozen config object with:
       - `port`: from `PORT` env, default 3000, parsed as integer
       - `host`: from `HOST` env, default '127.0.0.1'
       - `routerToken`: from `ROUTER_TOKEN` env, required — throw if missing
       - `openrouterBaseUrl`: from `OPENROUTER_BASE_URL` env, default 'https://openrouter.ai/api'
       - `openrouterModel`: from `OPENROUTER_MODEL` env, default 'nvidia/nemotron-3-ultra-550b-a55b:free'
       - `keyCooldownMs`: from `KEY_COOLDOWN_MS` env, default 30000, parsed as integer
       - `requestTimeoutMs`: from `REQUEST_TIMEOUT_MS` env, default 120000, parsed as integer
       - `credentials`: array of `{ id: 'KEY_1', key: '<actual key>' }` loaded from `OPENROUTER_KEY_1` through `OPENROUTER_KEY_20`, filtering out empty/undefined values
    3. Validate that at least one credential is configured — throw if none
    4. Use Object.freeze on the returned config
    5. Do NOT log any credential values during loading

    AVOID:
    - Default values for ROUTER_TOKEN (must be explicitly set)
    - Including the actual key value in any error message
    - Using `eval` or dynamic require
  </action>
  <verify>node -e "process.env.ROUTER_TOKEN='test'; process.env.OPENROUTER_KEY_1='fake'; const c = require('./src/config.js'); console.log(typeof c.port, typeof c.host, typeof c.routerToken, c.credentials.length, Object.isFrozen(c))"</verify>
  <done>Config module loads, validates, returns frozen object with correct types, and credentials array has length 1</done>
</task>

<task type="auto">
  <name>Create src/logger.js</name>
  <files>src/logger.js</files>
  <action>
    Create a structured logging module that:

    1. Exports functions: `info(msg, data)`, `warn(msg, data)`, `error(msg, data)`, `request(data)`
    2. Each function outputs a single JSON line to stdout with:
       - `timestamp`: ISO 8601
       - `level`: 'info', 'warn', 'error', or 'request'
       - `message`: the msg string
       - Spread of `data` object
    3. The `request` function specifically formats:
       - `method`, `path`, `status`, `credential`, `latencyMs`, `failover` (boolean)
    4. Implement a `sanitize(data)` function that:
       - Removes any key matching /key|token|secret|auth|password|credential_value/i
       - Replaces their values with '[REDACTED]'
       - Works recursively on nested objects
       - Is applied to ALL log output
    5. Use `console.log(JSON.stringify(...))` for output

    AVOID:
    - Using any external logging library
    - Exposing unsanitized data in any code path
    - Pretty-printing (keep single-line JSON for machine parsing)
  </action>
  <verify>node -e "const log = require('./src/logger.js'); log.info('test', { foo: 'bar', apiKey: 'SHOULD_NOT_APPEAR' }); log.request({ method: 'GET', path: '/health', status: 200, credential: 'KEY_1', latencyMs: 42, failover: false, Authorization: 'secret' })"</verify>
  <done>Logger outputs JSON lines, 'apiKey' value is [REDACTED], 'Authorization' value is [REDACTED], credential identifier KEY_1 is visible</done>
</task>

## Success Criteria
- [ ] `src/config.js` loads env vars, validates, returns frozen config
- [ ] `src/logger.js` outputs structured JSON, sanitizes secrets
- [ ] Empty credentials filtered out
- [ ] Missing ROUTER_TOKEN throws clear error
- [ ] No secret values appear in any log output
