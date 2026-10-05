# ROADMAP.md

> **Current Phase**: Not started
> **Milestone**: v1.0

## Must-Haves (from SPEC)

- [x] Local HTTP gateway on 127.0.0.1:3000
- [x] Claude Code → Gateway → OpenRouter forwarding with streaming
- [x] Multi-credential support with health tracking and failover
- [x] 429 pass-through (no rotation)
- [x] Security: no leaked secrets, localhost-only
- [x] Health endpoint
- [x] Structured safe logging
- [x] Test suite (35 cases across 8 suites)
- [x] Full documentation

## Phases

### Phase 1: Foundation
**Status**: ✅ Complete
**Objective**: Project scaffolding, configuration system, and secure environment loading
**Requirements**: REQ-01, REQ-09, REQ-17, REQ-18, REQ-22

---

### Phase 2: Credential Management & Health
**Status**: ✅ Complete
**Objective**: Credential manager with health tracking, cooldown, and selection logic
**Requirements**: REQ-10, REQ-11, REQ-12, REQ-13, REQ-14

---

### Phase 3: Core Proxy & Streaming
**Status**: ✅ Complete
**Objective**: HTTP server, request forwarding, streaming, and failover routing
**Requirements**: REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-08, REQ-16

---

### Phase 4: Testing
**Status**: ✅ Complete
**Objective**: Comprehensive test suite covering all 20 specified scenarios
**Requirements**: REQ-19

---

### Phase 5: Documentation & Polish
**Status**: ✅ Complete
**Objective**: Complete documentation, architecture diagrams, and final review
**Requirements**: REQ-20, REQ-21

**Delivers:**
- `README.md` — Full 15-section documentation
- `docs/architecture.md` — Architecture diagrams, flows, and error matrix
- Final security review (zero secret leaks)
- Clean error messages & operational guides

**Exit Criteria:**
- README covers all 15 required sections
- Architecture doc has request lifecycle, auth flow, failover rules, error matrix
- No real credentials anywhere in docs
- All tests still pass after polish

**Depends on:** Phase 4 (tests passing)
