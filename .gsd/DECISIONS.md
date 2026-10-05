# DECISIONS.md — Architectural Decision Records

## ADR-001: Minimal Dependencies
**Date**: 2026-10-05
**Status**: Accepted
**Context**: The gateway needs HTTP client and server capabilities.
**Decision**: Use Node.js built-in `http` module for the server and native `fetch` for outbound requests. Only external dependency is `dotenv`.
**Rationale**: Reduces attack surface, avoids version conflicts, and keeps the project maintainable. Native fetch (Node 18+) and http module are sufficient for this use case.
**Consequences**: No Express, no Axios. Routing and middleware must be hand-rolled, but the gateway has very few routes.

## ADR-002: 429 Pass-Through Policy
**Date**: 2026-10-05
**Status**: Accepted
**Context**: When OpenRouter returns 429 (rate limited), should the gateway try another credential?
**Decision**: No. Return the 429 directly to Claude Code. Do not rotate credentials to bypass rate limits.
**Rationale**: Rate limits exist for a reason. Rotating credentials to bypass them is abuse of the API provider. The user explicitly requested this policy.
**Consequences**: Claude Code will see 429 errors and must handle them. Logs will record the event for visibility.

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
