# ORBITA-Gateway

> A robust, modular, secure local Node.js API gateway that sits between **Claude Code** and **OpenRouter**, forwarding requests to the **NVIDIA Nemotron 3 Ultra** model while preserving complete Claude Code functionality, streaming fidelity, and credential isolation.

---

## 1. What ORBITA-Gateway Does

When running Claude Code with OpenRouter, connecting directly can lead to credential exposure, lack of transient failover, or header incompatibilities. 

**ORBITA-Gateway** acts as a local proxy on `http://127.0.0.1:3000`:
* **Accepts standard Claude Code / Anthropic API requests** (`/v1/messages`, `/v1/models`).
* **Protects access** with a local `ROUTER_TOKEN` authentication guard.
* **Transforms and strips sensitive headers** (strips client `Host`, client tokens, connection headers).
* **Injects OpenRouter credentials** (`Authorization: Bearer <OPENROUTER_KEY>`).
* **Maintains streaming fidelity**: Unbuffered chunk-by-chunk Server-Sent Events (SSE) piping with immediate header flushing.
* **Manages a multi-credential pool** (up to 20 keys) with in-memory health tracking and automated cooldown recovery.
* **Fails over on transient infrastructure errors** (`408`, `500`, `502`, `503`, `504`, timeouts, connection drops) with a strict maximum of one alternate attempt.
* **Enforces provider policy non-rotation**: `429` (Rate Limit) and `402` (Payment/Quota) errors are passed through directly to Claude Code without credential rotation.
* **Guarantees zero secret exposure**: API keys and auth tokens are recursively scrubbed from all logs and endpoints.

---

## 2. Architecture & Request Flow

```
Claude Code (Terminal / IDE)
    │
    │ HTTP / JSON / SSE (ANTHROPIC_BASE_URL=http://127.0.0.1:3000)
    │ Auth: ROUTER_TOKEN
    ▼
┌────────────────────────────────────────────────────────┐
│ ORBITA-Gateway (127.0.0.1:3000)                        │
│                                                        │
│  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │ Local Auth Guard       │  │ Health Endpoint      │  │
│  │ (Validates ROUTER_TOKEN│  │ (GET /health)        │  │
│  └───────────┬────────────┘  └──────────────────────┘  │
│              ▼                                         │
│  ┌────────────────────────┐  ┌──────────────────────┐  │
│  │ Header Sanitizer &     │  │ Credential Manager   │  │
│  │ Upstream Formatter     │◄─┤ • In-memory health   │  │
│  └───────────┬────────────┘  │ • Cooldown tracking  │  │
│              ▼               │ • Single failover    │  │
│  ┌────────────────────────┐  └──────────────────────┘  │
│  │ Unbuffered SSE Streamer│                            │
│  └───────────┬────────────┘                            │
└──────────────┼─────────────────────────────────────────┘
               │ HTTPS (Authorization: Bearer <OPENROUTER_KEY>)
               ▼
┌──────────────────────────────┐
│       OpenRouter API         │
│ (https://openrouter.ai/api)  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   NVIDIA Nemotron 3 Ultra    │
│(nvidia/nemotron-3-ultra-550b)│
└──────────────────────────────┘
```

For complete architectural details, see [docs/architecture.md](docs/architecture.md).

---

## 3. Installation & Quick Start

### Prerequisites
* **Node.js**: `>=18.0.0` (Native `fetch` and ES modules required)
* **Windows 10/11** with PowerShell or any standard shell

### Step 1: Install Dependencies
```powershell
npm install
```
*(Only `dotenv` is installed; no heavy web frameworks or external libraries).*

### Step 2: Configure Environment
Copy the example environment file:
```powershell
Copy-Item .env.example .env
```
Edit `.env` and set your local password and OpenRouter key:
```ini
PORT=3000
HOST=127.0.0.1
ROUTER_TOKEN=my-secure-local-password
OPENROUTER_KEY_1=sk-or-v1-your-actual-openrouter-key-here
```

### Step 3: Start the Gateway
```powershell
# Production mode
npm start

# Development mode (auto-reloads on source changes)
npm run dev
```

### Step 4: Verify Health
In a separate PowerShell terminal:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/health"
```
Expected output:
```json
{
  "service": "ORBITA-Gateway",
  "status": "ok",
  "uptime": 5,
  "credentials": 1
}
```

---

## 4. Connecting Claude Code

Configure Claude Code to route all traffic through ORBITA-Gateway.

### Recommended Configuration (`config.json` / Environment)
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:3000",
    "ANTHROPIC_AUTH_TOKEN": "my-secure-local-password",
    "ANTHROPIC_MODEL": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  },
  "model": "nvidia/nemotron-3-ultra-550b-a55b:free"
}
```

### Setting via PowerShell Session
```powershell
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:3000"
$env:ANTHROPIC_AUTH_TOKEN = "my-secure-local-password"
$env:ANTHROPIC_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1"
claude
```

---

## 5. Configuration Reference

All settings are configured through environment variables loaded via `.env`:

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | `3000` | Local TCP port for ORBITA-Gateway |
| `HOST` | `127.0.0.1` | Local bind address. Keep `127.0.0.1` for localhost isolation |
| `ROUTER_TOKEN` | *(Required)* | Secret token that Claude Code sends to authenticate |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api` | Upstream OpenRouter API root endpoint |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b:free` | Target model identifier |
| `OPENROUTER_KEY_1` | `""` | Primary OpenRouter API key |
| `OPENROUTER_KEY_2` .. `_20` | `""` | Optional failover credentials (empty variables are ignored) |
| `KEY_COOLDOWN_MS` | `30000` (30s) | Duration a failed key remains in cooldown before recovery |
| `REQUEST_TIMEOUT_MS` | `120000` (2m) | Upstream request timeout before returning HTTP 504 |

---

## 6. Authentication & Header Translation

* **Accepted Local Credentials**: The gateway accepts either:
  * `Authorization: Bearer <ROUTER_TOKEN>`
  * `Authorization: <ROUTER_TOKEN>`
  * `x-api-key: <ROUTER_TOKEN>`
* **Host Stripping**: The client's incoming `Host: 127.0.0.1:3000` is stripped so OpenRouter receives the correct upstream host, preventing Cloudflare 403 errors.
* **Secret Isolation**: Incoming client tokens are stripped and replaced with `Authorization: Bearer <OPENROUTER_KEY>`. Client tokens are never forwarded upstream.
* **Header Preservation**: Headers such as `anthropic-version`, `anthropic-beta`, and `content-type` are passed through untouched.

---

## 7. Streaming Fidelity

Claude Code requires unbuffered Server-Sent Events (SSE) for interactive token delivery:
1. When upstream sends headers, the gateway executes `res.writeHead(status, headers)` and immediately calls `res.flushHeaders()` to disable socket buffering.
2. Incoming chunks are piped directly to the client socket without buffering the complete response body.
3. If an upstream stream terminates, the client socket is closed cleanly.

---

## 8. Failover & Health Rules

### Transient Failover (Allowed Once Per Request)
Transient failures are temporary infrastructure glitches where an alternate credential can succeed. Failover is triggered on:
* Connection failure (`ECONNREFUSED`, `ENOTFOUND`, network drop)
* Request timeout (exceeding `REQUEST_TIMEOUT_MS`)
* HTTP `408` Request Timeout
* HTTP `500` Internal Server Error
* HTTP `502` Bad Gateway
* HTTP `503` Service Unavailable
* HTTP `504` Gateway Timeout

**Failover Process**:
1. Mark current credential unhealthy (`markFailed`).
2. Select next healthy credential from the pool (`getCredential(excludeId)`).
3. Retry request **once**.
4. If the alternate credential fails, return the error to Claude Code. **No infinite retry loops.**
5. **Streaming Boundary**: Failover is only possible **before** downstream response headers are committed to Claude Code.

### Non-Failover Policy (Strict Pass-Through)
The gateway **never** switches credentials for:
* **HTTP `429` (Too Many Requests)**: Rate limits are passed directly back to Claude Code.
* **HTTP `402` (Payment Required / Insufficient Credits)**: Quota errors are passed directly back to Claude Code.
* **Account Usage Limits**: Bypassing provider account limits through rotation is forbidden.
* **Client Errors (`400`, `401`, `403`, `404`)**: Returned directly to the client.

---

## 9. Operational Error Matrix

| Status | Trigger Condition | Gateway Behavior | Failover? |
|---|---|---|---|
| **200** | Normal upstream success | Stream response to client | No |
| **400** | Invalid JSON or client parameters | Pass upstream body to client | No |
| **401** | Missing/invalid `ROUTER_TOKEN` | Gateway returns `authentication_error` | No |
| **402** | OpenRouter out of credits | Pass upstream 402 directly to client | **No** |
| **403** | Account limit or model permission | Pass upstream 403 directly to client | **No** |
| **404** | Invalid endpoint path | Pass upstream 404 directly to client | **No** |
| **408** | Upstream timed out | Retry once with alternate key | **Yes** |
| **429** | Upstream rate limited | Pass upstream 429 directly to client | **No** |
| **500** | Upstream internal error | Retry once with alternate key | **Yes** |
| **502** | Upstream bad gateway | Retry once with alternate key | **Yes** |
| **503** | No keys configured OR upstream down | Return 503 or retry once with alternate | **Yes (if keys exist)** |
| **504** | Upstream gateway timeout | Retry once with alternate key | **Yes** |
| **Timeout** | Request exceeds `REQUEST_TIMEOUT_MS` | Abort and retry once with alternate | **Yes** |

---

## 10. Security & Privacy

* **Localhost Binding**: Binds strictly to `127.0.0.1` by default. Never expose port 3000 to public interfaces.
* **Log Redaction**: [src/logger.js](src/logger.js) recursively scrubs secret patterns (`sk-or-v1-...`, `sk-...`, `Bearer ...`, `x-api-key`, passwords) from log messages and nested objects.
* **Git Hygiene**: `.env` is ignored by [.gitignore](.gitignore). Real API keys must never be committed to git.
* **Health Isolation**: `GET /health` reports only the *count* of configured keys (e.g. `credentials: 2`), never exposing keys or tokens.

---

## 11. Testing & Validation

Run the permanent test suite covering 35 automated scenarios across 8 test suites:

```powershell
npm test
```

### Test Suites Included
* `test/health.test.js`: Health endpoint response, schema, and secret isolation.
* `test/auth.test.js`: Authentication guard (Bearer, raw token, x-api-key, 401 error schema).
* `test/forwarding.test.js`: Host removal, credential injection, body & Anthropic header preservation.
* `test/streaming.test.js`: Unbuffered chunk-by-chunk SSE streaming fidelity.
* `test/failover.test.js`: 408/500/502/503/504 transient failover & single alternate attempt enforcement.
* `test/quota.test.js`: 429, 402, and account-limit non-rotation pass-through verification.
* `test/security.test.js`: Log secret redaction and harmless field preservation.
* `test/integration.test.js`: Timeout abort (504), cooldown recovery, and graceful shutdown.

> **Validation Note**: All automated tests run against local, deterministic mock upstream servers. No live calls to OpenRouter or the Nemotron model are performed during automated testing. Live validation occurs only when you configure active credentials in `.env`.

---

## 12. Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| `HTTP 401 Unauthorized` | Claude Code token does not match `ROUTER_TOKEN` | Verify `ANTHROPIC_AUTH_TOKEN` matches `ROUTER_TOKEN` in `.env` |
| `HTTP 503 Service Unavailable` | No credentials in `.env` or all keys in cooldown | Add at least one valid key to `OPENROUTER_KEY_1` in `.env` |
| `HTTP 504 Gateway Timeout` | OpenRouter model took longer than `REQUEST_TIMEOUT_MS` | Increase `REQUEST_TIMEOUT_MS` in `.env` (e.g. `180000`) |
| `HTTP 429 Too Many Requests` | OpenRouter rate limit hit | Gateway passes this through. Wait or upgrade OpenRouter tier |
| `HTTP 402 Payment Required` | OpenRouter balance depleted | Add credits to your OpenRouter account |
| `Port 3000 already in use` | Another process is using port 3000 | Change `PORT=3001` in `.env` and `ANTHROPIC_BASE_URL` in Claude Code |

---

## 13. Stopping the Gateway

To stop ORBITA-Gateway cleanly:
* **Interactive Terminal**: Press `Ctrl+C`.
* **PowerShell**:
  ```powershell
  # Find and stop Node process on port 3000
  $conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
  if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
  ```
The server catches `SIGINT` and `SIGTERM` signals and cleanly drains connections.
