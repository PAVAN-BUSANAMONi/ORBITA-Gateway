# ROADMAP.md

> **Current Phase**: Not started
> **Milestone**: v1.0

## Must-Haves (from SPEC)

- [ ] Local HTTP gateway on 127.0.0.1:3000
- [ ] Claude Code → Gateway → OpenRouter forwarding with streaming
- [ ] Multi-credential support with health tracking and failover
- [ ] 429 pass-through (no rotation)
- [ ] Security: no leaked secrets, localhost-only
- [ ] Health endpoint
- [ ] Structured safe logging
- [ ] Test suite (12 cases)
- [ ] Full documentation

## Phases

### Phase 1: Foundation
**Status**: ⬜ Not Started
**Objective**: Project scaffolding, configuration system, and secure environment loading
**Requirements**: REQ-01, REQ-09, REQ-17, REQ-18, REQ-22

**Delivers:**
- `src/config.js` — Environment loading, validation, defaults
- `src/logger.js` — Structured safe logging (no secrets)
- `.env.example` — Placeholder template
- `.gitignore` — Proper ignore rules
- `package.json` — Updated with scripts and metadata
- Credential loading from `OPENROUTER_KEY_1..20`

**Exit Criteria:**
- Config loads and validates all env vars
- Logger outputs structured JSON without secrets
- Empty credentials are filtered out
- Package scripts work (`start`, `dev`, `test`)

---

### Phase 2: Credential Management & Health
**Status**: ⬜ Not Started
**Objective**: Credential manager with health tracking, cooldown, and selection logic
**Requirements**: REQ-10, REQ-11, REQ-12, REQ-13, REQ-14

**Delivers:**
- `src/credentials.js` — Credential pool, health state, selection
- `src/health.js` — Health endpoint handler

**Exit Criteria:**
- Healthy credential selection works
- Failed credential enters cooldown and recovers
- Credential selection skips unhealthy keys
- Health endpoint returns correct schema
- No API keys exposed in any output

**Depends on:** Phase 1 (config, logger)

---

### Phase 3: Core Proxy & Streaming
**Status**: ✅ Complete
**Objective**: HTTP server, request forwarding, streaming, and failover routing
**Requirements**: REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-08, REQ-16

**Delivers:**
- `src/server.js` — HTTP server with auth middleware and route dispatch
- `src/router.js` — OpenRouter forwarding with streaming support and failover

**Exit Criteria:**
- Server starts and binds to configured host:port
- Local auth with ROUTER_TOKEN works (valid → forward, invalid → 401)
- Requests forwarded to OpenRouter with correct headers
- Streaming responses piped through without buffering
- Transient failure triggers one failover attempt
- 429 returned as-is, no rotation
- Timeout handling works
- Structured log entry per request

**Depends on:** Phase 2 (credentials, health)

---

### Phase 4: Testing
**Status**: ⬜ Not Started
**Objective**: Comprehensive test suite covering all 12 specified scenarios
**Requirements**: REQ-19

**Delivers:**
- `test/health.test.js` — Health endpoint tests
- `test/auth.test.js` — Authentication tests
- `test/routing.test.js` — Forwarding and streaming tests
- `test/failover.test.js` — Failover and 429 behavior tests

**Exit Criteria:**
- All 12 test scenarios pass
- Tests run via `npm test`
- No real API calls in tests (mock OpenRouter)
- No secrets in test fixtures

**Depends on:** Phase 3 (server, router)

---

### Phase 5: Documentation & Polish
**Status**: ⬜ Not Started
**Objective**: Complete documentation, architecture diagrams, and final review
**Requirements**: REQ-20, REQ-21

**Delivers:**
- `README.md` — Full 15-section documentation
- `docs/architecture.md` — Architecture diagrams and flows
- Final security review
- Clean error messages

**Exit Criteria:**
- README covers all 15 required sections
- Architecture doc has request lifecycle, auth flow, failover rules
- No real credentials anywhere in docs
- All tests still pass after polish

**Depends on:** Phase 4 (tests passing)
