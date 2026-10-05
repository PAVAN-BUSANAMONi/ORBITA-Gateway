const SENSITIVE_FIELD_NAMES = /^(key|api_?key|authorization|router_?token|token|secret|password|auth|x-api-key|xApiKey)$/i;

/**
 * Redacts secret patterns from string values and log messages.
 * Matches:
 * - OpenRouter API keys (sk-or-v1-...)
 * - Generic API keys (sk-...)
 * - Bearer tokens (Bearer ...)
 * - x-api-key patterns (x-api-key: ...)
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/sk-or-v1-[a-zA-Z0-9_-]+/gi, '[REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]{20,}/gi, '[REDACTED]')
    .replace(/Bearer\s+[^\s"'\`,]+/gi, 'Bearer [REDACTED]')
    .replace(/(x-api-key[:=\s]+)[^\s"'\`,]+/gi, '$1[REDACTED]');
}

/**
 * Recursively sanitizes data objects:
 * 1. Replaces values of sensitive field names with '[REDACTED]'.
 * 2. Scrubs string values for embedded tokens/keys.
 * 3. Preserves harmless fields like keyCount, cooldownMs, credential, credentials, credentialId.
 */
export function sanitize(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return sanitizeString(data);
  if (typeof data !== 'object') return data;
  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeString(data.message),
      stack: sanitizeString(data.stack),
    };
  }
  if (Array.isArray(data)) return data.map(sanitize);

  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_FIELD_NAMES.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      clean[k] = sanitizeString(v);
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitize(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function formatEntry(level, message, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizeString(message),
    ...sanitize(data || {}),
  };
  return JSON.stringify(entry);
}

export function info(message, data) {
  console.log(formatEntry('info', message, data));
}

export function warn(message, data) {
  console.log(formatEntry('warn', message, data));
}

export function error(message, data) {
  console.log(formatEntry('error', message, data));
}

export function request(data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'request',
    message: sanitizeString(`${data.method} ${data.path} ${data.status}`),
    method: data.method,
    path: data.path,
    status: data.status,
    credential: data.credential,
    latencyMs: data.latencyMs,
    failover: data.failover || false,
    ...sanitize(
      Object.fromEntries(
        Object.entries(data).filter(
          ([k]) => !['method', 'path', 'status', 'credential', 'latencyMs', 'failover'].includes(k)
        )
      )
    ),
  };
  console.log(JSON.stringify(entry));
}

export default { info, warn, error, request, sanitize, sanitizeString };
