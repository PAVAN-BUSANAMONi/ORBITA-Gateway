import 'dotenv/config';

export function loadCredentials(env = process.env) {
  const credentials = [];
  for (let i = 1; i <= 20; i++) {
    const key = env[`OPENROUTER_KEY_${i}`];
    if (key && key.trim()) {
      credentials.push({ id: `KEY_${i}`, key: key.trim() });
    }
  }
  return credentials;
}

function loadConfig() {
  const routerToken = process.env.ROUTER_TOKEN;
  if (!routerToken) {
    throw new Error(
      'ROUTER_TOKEN environment variable is required. Set it in your .env file.'
    );
  }

  const credentials = loadCredentials(process.env);
  if (credentials.length === 0) {
    console.warn(
      '[WARN] No OpenRouter credentials configured (OPENROUTER_KEY_1..20). Gateway will return HTTP 503 for proxy requests until credentials are added.'
    );
  }

  return Object.freeze({
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '127.0.0.1',
    routerToken,
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api',
    openrouterModel: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free',
    keyCooldownMs: parseInt(process.env.KEY_COOLDOWN_MS || '30000', 10),
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10),
    credentials,
  });
}

const config = loadConfig();

export default config;
