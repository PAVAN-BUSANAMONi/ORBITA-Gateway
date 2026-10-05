# JOURNAL.md — Development Journal

## 2026-10-05

### Project Initialization
- Created SPEC.md from comprehensive user requirements
- Distilled 22 formal requirements from the specification
- Designed 5-phase roadmap: Foundation → Credentials → Core Proxy → Testing → Documentation
- Recorded 5 architectural decisions (ADRs)
- Key design choice: 429 pass-through, not rotation — respects API provider rate limits
- Key design choice: single failover attempt per request — prevents cascading failures
