# DECISIONS.md — Architectural Decision Records

## ADR-001: Minimal Dependencies
**Date**: 2026-10-05
**Status**: Accepted
**Context**: The gateway needs HTTP client and server capabilities.
**Decision**: Use Node.js built-in `http` module for the server and native `fetch` for outbound requests. Only external dependency is `dotenv`.
**Rationale**: Reduces attack surface, avoids version conflicts, and keeps the project maintainable. Native fetch (Node 18+) and http module are sufficient for this use case.
**Consequences**: No Express, no Axios. Routing and middleware must be hand-rolled, but the gateway has very few routes.

## ADR-002: Rate Limit and Quota Exhaustion Pass-Through Policy
**Date**: 2026-10-05
**Status**: Accepted
**Context**: When OpenRouter returns 429 (rate limited), 402 (payment required), or account quota exhaustion / usage-limit errors, should the gateway try another credential?
**Decision**: No. Return the upstream error directly to Claude Code without credential rotation. Specifically:
- HTTP 429 → no rotation
- HTTP 402 → no rotation
- Quota exhaustion / account usage limits → no rotation
- Only transient infrastructure failures (connection failure, timeout, 408, 500, 502, 503, 504) may trigger failover.
**Rationale**: Rate limits and account quotas exist for provider-level constraints. Rotating credentials to bypass them is an abuse vector and masks legitimate account status. Transient infrastructure errors represent temporary networking or gateway blips where failover is appropriate.
**Consequences**: Claude Code receives upstream rate limit and quota responses as-is. Logs record the event safely without leaking secrets or attempting unauthorized credential rotation.

## ADR-003: In-Memory Health Tracking Only
**Date**: 2026-10-05
**Status**: Accepted
**Context**: Should credential health state be persisted to disk?
**Decision**: Track health in memory only. State resets on restart.
**Rationale**: The gateway is a local development tool. Credential health issues are transient by nature (network blips, temporary outages). Clean state on restart is desirable — a previously-failed key should be retried after restart.
**Consequences**: All credentials start healthy on every server restart.

## ADR-004: Single Failover Attempt
**Date**: 2026-10-05
**Status**: Accepted
**Context**: How many retry attempts should be made on transient failure?
**Decision**: Maximum one alternate credential attempt per request.
**Rationale**: Prevents cascading failures, keeps latency bounded, and avoids infinite retry loops. If two credentials both fail on the same request, the issue is likely systemic.
**Consequences**: If both primary and failover credential fail, the error from the failover attempt is returned to Claude Code.

## ADR-005: Credential Identifier Logging
**Date**: 2026-10-05
**Status**: Accepted
**Context**: How to identify which credential was used in logs without exposing the key?
**Decision**: Use the environment variable suffix as identifier (e.g., `KEY_1`, `KEY_2`).
**Rationale**: Provides operational visibility for debugging without any risk of secret exposure. The identifier is derived from the env var name, not the key value.
**Consequences**: Logs show `credential=KEY_1` instead of any part of the actual API key.
