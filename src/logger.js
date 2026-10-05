const SENSITIVE_KEYS = /key|token|secret|auth|password|credential_value|api_key|apikey/i;

function sanitize(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEYS.test(k)) {
      clean[k] = '[REDACTED]';
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
    message,
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
    message: `${data.method} ${data.path} ${data.status}`,
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

export default { info, warn, error, request };
