import config from './config.js';
import logger from './logger.js';

/**
 * Creates an isolated credential manager instance.
 * @param {Array<{ id: string, key: string }>} [initialCredentials]
 * @param {number} [initialCooldownMs]
 */
export function createCredentialManager(
  initialCredentials = config.credentials,
  initialCooldownMs = config.keyCooldownMs
) {
  // Validate and deduplicate credentials
  const credentials = [];
  const seenIds = new Set();
  if (Array.isArray(initialCredentials)) {
    for (const cred of initialCredentials) {
      if (!cred || typeof cred.id !== 'string' || typeof cred.key !== 'string') continue;
      if (seenIds.has(cred.id)) continue;
      seenIds.add(cred.id);
      credentials.push({ id: cred.id, key: cred.key });
    }
  }

  let cooldownMs = initialCooldownMs;

  /** @type {Map<string, { healthy: boolean, lastFailure: number|null, failureCount: number }>} */
  const healthState = new Map();

  for (const cred of credentials) {
    healthState.set(cred.id, {
      healthy: true,
      lastFailure: null,
      failureCount: 0,
    });
  }

  function setCooldownMs(ms) {
    if (typeof ms === 'number' && ms >= 0) {
      cooldownMs = ms;
    } else {
      cooldownMs = initialCooldownMs;
    }
  }

  function getCooldownMs() {
    return cooldownMs;
  }

  function refreshCooldowns() {
    const now = Date.now();
    for (const [id, state] of healthState) {
      if (!state.healthy && state.lastFailure !== null) {
        if (now - state.lastFailure >= cooldownMs) {
          state.healthy = true;
          logger.info('Credential cooldown expired, marking healthy', { credential: id });
        }
      }
    }
  }

  function getCredential(excludeId) {
    refreshCooldowns();

    for (const cred of credentials) {
      if (excludeId && cred.id === excludeId) continue;

      const state = healthState.get(cred.id);
      if (state && state.healthy) {
        return { id: cred.id, key: cred.key };
      }
    }

    return null;
  }

  function markFailed(id) {
    const state = healthState.get(id);
    if (state) {
      state.healthy = false;
      state.lastFailure = Date.now();
      state.failureCount += 1;
      logger.warn('Credential marked unhealthy', {
        credential: id,
        failureCount: state.failureCount,
        cooldownMs,
      });
    }
  }

  function markSuccess(id) {
    const state = healthState.get(id);
    if (state) {
      state.healthy = true;
      state.failureCount = 0;
    }
  }

  function getHealthSummary() {
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

  function getCredentialCount() {
    return credentials.length;
  }

  function reset() {
    for (const [id, state] of healthState) {
      state.healthy = true;
      state.lastFailure = null;
      state.failureCount = 0;
    }
  }

  function markAllFailed() {
    for (const [id] of healthState) {
      markFailed(id);
    }
  }

  return {
    getCredential,
    markFailed,
    markSuccess,
    getHealthSummary,
    getCredentialCount,
    setCooldownMs,
    getCooldownMs,
    reset,
    markAllFailed,
  };
}

// Default singleton instance using application config
const defaultManager = createCredentialManager(config.credentials, config.keyCooldownMs);

export const getCredential = defaultManager.getCredential;
export const markFailed = defaultManager.markFailed;
export const markSuccess = defaultManager.markSuccess;
export const getHealthSummary = defaultManager.getHealthSummary;
export const getCredentialCount = defaultManager.getCredentialCount;
export const setCooldownMs = defaultManager.setCooldownMs;
export const getCooldownMs = defaultManager.getCooldownMs;
export const reset = defaultManager.reset;
export const markAllFailed = defaultManager.markAllFailed;

export default defaultManager;
