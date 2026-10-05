# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision

ORBITA-Gateway is a local Node.js API gateway that sits between Claude Code and OpenRouter, enabling Claude Code to use the NVIDIA Nemotron 3 Ultra model through OpenRouter while preserving all Claude Code functionality including streaming, long-running requests, and structured error handling. It runs exclusively on localhost, provides multi-credential failover for transient infrastructure errors, and never exposes secrets.

## Goals

1. **Local API Gateway** — Run a transparent HTTP proxy on `127.0.0.1:3000` that accepts Claude Code requests and forwards them to OpenRouter
2. **Streaming Fidelity** — Preserve streaming responses without unnecessary buffering, supporting long-running coding agent workloads
3. **Credential Management** — Support up to 20 OpenRouter API keys with health tracking, cooldown, and failover for transient errors only
4. **Security** — Never expose API keys in logs, endpoints, documentation, or git history; bind to localhost only
5. **Operational Visibility** — Provide health endpoint, structured logging, and credential health tracking

## Non-Goals (Out of Scope)

- Multi-user or multi-tenant support
- Public network exposure or TLS termination
- Web UI or admin dashboard
- Rate limit bypass (429 responses are returned as-is, never rotated around)
- Credential rotation for quota exhaustion or account limits
- Database or persistent storage
- Docker/containerization
- CI/CD pipeline
- Model-specific request transformation or prompt engineering

## Users

**Primary user**: A single developer running Claude Code locally on Windows 10/11 in Antigravity IDE. Claude Code connects to the gateway via `ANTHROPIC_BASE_URL=http://127.0.0.1:3000`.

## Constraints

- **Platform**: Windows 10/11, PowerShell, Node.js
- **Runtime**: Node.js with native `fetch` and built-in HTTP — minimal external dependencies
- **Dependencies**: Only `dotenv` for environment loading; avoid frameworks
- **Network**: Localhost-only binding (`127.0.0.1`)
- **Model**: Primary target is `nvidia/nemotron-3-ultra-550b-a55b:free` via OpenRouter
- **Credentials**: Real API keys added manually post-setup; never in source/docs/git

## Success Criteria

- [ ] Gateway starts on `127.0.0.1:3000` and responds to `GET /health`
- [ ] Claude Code connects and sends requests through the gateway successfully
- [ ] Streaming responses pass through without buffering
- [ ] Invalid local auth token returns 401
- [ ] Transient failures (5xx, timeout, connection error) trigger failover to alternate credential
- [ ] HTTP 429 returns upstream response directly — no credential rotation
- [ ] No API keys appear in any log output
- [ ] All 12 specified test cases pass
- [ ] `.env` is git-ignored; `.env.example` uses only placeholders
- [ ] Documentation covers full setup, architecture, and troubleshooting
