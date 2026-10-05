import config from './config.js';
import logger from './logger.js';

/** @type {Map<string, { healthy: boolean, lastFailure: number|null, failureCount: number }>} */
const healthState = new Map();

// Initialize health state from config
for (const cred of config.credentials) {
  healthState.set(cred.id, {
    healthy: true,
    lastFailure: null,
    failureCount: 0,
  });
}

/**
 * Check if an unhealthy credential has passed its cooldown period
 * and should be marked healthy again.
 */
function refreshCooldowns() {
  const now = Date.now();
  for (const [id, state] of healthState) {
    if (!state.healthy && state.lastFailure !== null) {
      if (now - state.lastFailure >= config.keyCooldownMs) {
        state.healthy = true;
        logger.info('Credential cooldown expired, marking healthy', { credential: id });
      }
    }
  }
}

/**
 * Get a healthy credential for use.
 * @param {string} [excludeId] - Credential ID to skip (for failover).
 * @returns {{ id: string, key: string } | null}
 */
export function getCredential(excludeId) {
  refreshCooldowns();

  for (const cred of config.credentials) {
    if (excludeId && cred.id === excludeId) continue;

    const state = healthState.get(cred.id);
    if (state && state.healthy) {
      return { id: cred.id, key: cred.key };
    }
  }

  return null;
}

/**
 * Mark a credential as failed (unhealthy with cooldown).
 * @param {string} id - Credential ID (e.g., 'KEY_1')
 */
export function markFailed(id) {
  const state = healthState.get(id);
  if (state) {
    state.healthy = false;
    state.lastFailure = Date.now();
    state.failureCount += 1;
    logger.warn('Credential marked unhealthy', {
      credential: id,
      failureCount: state.failureCount,
      cooldownMs: config.keyCooldownMs,
    });
  }
}

/**
 * Mark a credential as successful (reset failure tracking).
 * @param {string} id - Credential ID (e.g., 'KEY_1')
 */
export function markSuccess(id) {
  const state = healthState.get(id);
  if (state) {
    state.healthy = true;
    state.failureCount = 0;
  }
}

/**
 * Get health summary for all credentials (never includes actual keys).
 * @returns {Array<{ id: string, healthy: boolean, lastFailure: number|null }>}
 */
export function getHealthSummary() {
  const summary = [];
  for (const [id, state] of healthState) {
    summary.push({
      id,
      healthy: state.healthy,
      lastFailure: state.lastFailure,
    });
  }
  return summary;
}

/**
 * Get the total number of configured credentials.
 * @returns {number}
 */
export function getCredentialCount() {
  return config.credentials.length;
}

export default {
  getCredential,
  markFailed,
  markSuccess,
  getHealthSummary,
  getCredentialCount,
};
