import config from './config.js';
import logger from './logger.js';
import credentialsManager from './credentials.js';

const TRANSIENT_STATUS_CODES = new Set([408, 500, 502, 503, 504]);

// Headers that should never be forwarded upstream from the client
const STRIP_INCOMING_HEADERS = new Set([
  'host',
  'authorization',
  'x-api-key',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
]);

// Headers that should not be copied from upstream to downstream response
const STRIP_UPSTREAM_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
]);

/**
 * Validates local router token against incoming request.
 * Accepts:
 * - Authorization: Bearer <ROUTER_TOKEN>
 * - Authorization: <ROUTER_TOKEN>
 * - x-api-key: <ROUTER_TOKEN>
 */
export function validateLocalAuth(req, expectedToken) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    const token = parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : authHeader.trim();
    if (token === expectedToken) return true;
  }

  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && apiKeyHeader.trim() === expectedToken) {
    return true;
  }

  return false;
}

/**
 * Reads request body into a Buffer to allow replaying on failover.
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Prepares clean headers for OpenRouter request.
 */
function buildUpstreamHeaders(incomingHeaders, credKey, bodyLength) {
  const headers = {};
  for (const [k, v] of Object.entries(incomingHeaders)) {
    if (STRIP_INCOMING_HEADERS.has(k.toLowerCase())) continue;
    headers[k] = v;
  }

  // Inject selected OpenRouter credential
  headers['authorization'] = `Bearer ${credKey}`;

  if (bodyLength > 0) {
    headers['content-length'] = String(bodyLength);
  }

  return headers;
}

/**
 * Sends request to upstream OpenRouter with timeout.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Upstream request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Main router request handler.
 * Proxies request to OpenRouter with single failover on transient errors.
 */
export async function handleRequest(req, res) {
  const startTime = Date.now();

  // 1. Validate local authentication
  if (!validateLocalAuth(req, config.routerToken)) {
    const status = 401;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: 'Unauthorized: Missing or invalid local router authentication token',
          type: 'authentication_error',
        },
      })
    );
    logger.request({
      method: req.method,
      path: req.url,
      status,
      credential: 'NONE',
      latencyMs: Date.now() - startTime,
      failover: false,
    });
    return;
  }

  // 2. Select initial healthy credential
  const primaryCred = credentialsManager.getCredential();
  if (!primaryCred) {
    const status = 503;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: 'Service Unavailable: No OpenRouter credentials configured or available',
          type: 'service_unavailable',
        },
      })
    );
    logger.request({
      method: req.method,
      path: req.url,
      status,
      credential: 'NONE',
      latencyMs: Date.now() - startTime,
      failover: false,
    });
    return;
  }

  // 3. Read body if method has body
  let bodyBuffer = Buffer.alloc(0);
  if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    try {
      bodyBuffer = await readRequestBody(req);
    } catch (err) {
      const status = 400;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Failed to read request body', type: 'bad_request' } }));
      logger.error('Failed to read request body', { error: err.message });
      return;
    }
  }

  // 4. Construct target URL
  const baseUrl = config.openrouterBaseUrl.replace(/\/+$/, '');
  const reqPath = req.url.startsWith('/') ? req.url : `/${req.url}`;
  const targetUrl = `${baseUrl}${reqPath}`;

  // 5. Attempt upstream request with max 1 alternate failover
  let currentCred = primaryCred;
  let failoverOccurred = false;
  let upstreamResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = buildUpstreamHeaders(req.headers, currentCred.key, bodyBuffer.length);
    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (bodyBuffer.length > 0) {
      fetchOptions.body = bodyBuffer;
    }

    try {
      const response = await fetchWithTimeout(targetUrl, fetchOptions, config.requestTimeoutMs);

      // Check for transient failure (408, 500, 502, 503, 504)
      if (TRANSIENT_STATUS_CODES.has(response.status) && attempt === 0) {
        credentialsManager.markFailed(currentCred.id);
        const alternateCred = credentialsManager.getCredential(currentCred.id);
        if (alternateCred) {
          logger.warn('Transient upstream status received, triggering failover', {
            failedCredential: currentCred.id,
            alternateCredential: alternateCred.id,
            status: response.status,
          });
          currentCred = alternateCred;
          failoverOccurred = true;
          continue; // Retry once with alternate credential
        }
      }

      // Successful or non-transient status (including 200, 400, 401, 402, 403, 404, 429)
      upstreamResponse = response;
      if (response.ok || response.status === 429 || response.status === 402) {
        credentialsManager.markSuccess(currentCred.id);
      } else if (TRANSIENT_STATUS_CODES.has(response.status)) {
        credentialsManager.markFailed(currentCred.id);
      }
      break;
    } catch (err) {
      lastError = err;
      // Network error or timeout is transient
      if (attempt === 0) {
        credentialsManager.markFailed(currentCred.id);
        const alternateCred = credentialsManager.getCredential(currentCred.id);
        if (alternateCred) {
          logger.warn('Transient network/timeout error, triggering failover', {
            failedCredential: currentCred.id,
            alternateCredential: alternateCred.id,
            error: err.message,
          });
          currentCred = alternateCred;
          failoverOccurred = true;
          continue; // Retry once with alternate credential
        }
      }
      break;
    }
  }

  // 6. Handle total network/timeout failure
  if (!upstreamResponse) {
    const isTimeout = lastError?.name === 'AbortError' || lastError?.message?.includes('timed out');
    const status = isTimeout ? 504 : 502;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: isTimeout
            ? `Gateway Timeout: Request exceeded ${config.requestTimeoutMs}ms`
            : `Bad Gateway: Unable to connect to OpenRouter (${lastError?.message || 'Connection failed'})`,
          type: isTimeout ? 'timeout_error' : 'upstream_connection_error',
        },
      })
    );
    logger.request({
      method: req.method,
      path: req.url,
      status,
      credential: currentCred.id,
      latencyMs: Date.now() - startTime,
      failover: failoverOccurred,
    });
    return;
  }

  // 7. Stream upstream response downstream to client (no buffering)
  const responseHeaders = {};
  for (const [k, v] of upstreamResponse.headers.entries()) {
    if (STRIP_UPSTREAM_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
    responseHeaders[k] = v;
  }

  res.writeHead(upstreamResponse.status, responseHeaders);
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  if (upstreamResponse.body) {
    try {
      for await (const chunk of upstreamResponse.body) {
        res.write(chunk);
      }
    } catch (streamErr) {
      logger.error('Error during response streaming', { error: streamErr.message });
    }
  }

  res.end();

  logger.request({
    method: req.method,
    path: req.url,
    status: upstreamResponse.status,
    credential: currentCred.id,
    latencyMs: Date.now() - startTime,
    failover: failoverOccurred,
  });
}

export default { handleRequest, validateLocalAuth };
