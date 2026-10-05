import { getCredentialCount } from './credentials.js';

const startTime = Date.now();

/**
 * Handle GET /health requests.
 * Returns service status, uptime, and credential count.
 * Never exposes credential values.
 *
 * @param {import('http').ServerResponse} res
 */
export function handleHealth(res) {
  const body = JSON.stringify({
    service: 'ORBITA-Gateway',
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    credentials: getCredentialCount(),
  });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export default { handleHealth };
