import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Security & Secrets Protection', () => {
  test('logger redacts API key patterns (sk-or-v1-*) from message and data', async () => {
    const { default: logger } = await import('../src/logger.js');
    const captured = [];
    const originalLog = console.log;
    console.log = (line) => captured.push(line);

    try {
      logger.info(
        'Failed request with key sk-or-v1-abcdef1234567890xyz and token secret123',
        {
          openRouterKey: 'sk-or-v1-999888777666555444',
          Authorization: 'Bearer super-secret-bearer-token',
          'x-api-key': 'local-admin-pass',
          nested: {
            details: 'embedded sk-or-v1-nested-key-val here',
          },
        }
      );
    } finally {
      console.log = originalLog;
    }

    assert.strictEqual(captured.length, 1);
    const output = captured[0];
    const parsed = JSON.parse(output);

    // Verify secrets are redacted in message
    assert.doesNotMatch(parsed.message, /sk-or-v1-abcdef1234567890xyz/);
    assert.match(parsed.message, /\[REDACTED\]/);

    // Verify object values are redacted
    assert.strictEqual(parsed.Authorization, '[REDACTED]');
    assert.strictEqual(parsed['x-api-key'], '[REDACTED]');
    assert.doesNotMatch(output, /super-secret-bearer-token/);
    assert.doesNotMatch(output, /local-admin-pass/);
    assert.doesNotMatch(output, /sk-or-v1-999888777666555444/);
    assert.doesNotMatch(output, /sk-or-v1-nested-key-val/);
  });

  test('logger preserves harmless operational fields without false-positive redaction', async () => {
    const { default: logger } = await import('../src/logger.js');
    const captured = [];
    const originalLog = console.log;
    console.log = (line) => captured.push(line);

    try {
      logger.info('Operational health update', {
        keyCount: 3,
        cooldownMs: 30000,
        credential: 'KEY_1',
        credentials: 'all-healthy',
        credentialId: 'KEY_2',
        keyCooldownMs: 15000,
      });
    } finally {
      console.log = originalLog;
    }

    assert.strictEqual(captured.length, 1);
    const parsed = JSON.parse(captured[0]);

    assert.strictEqual(parsed.keyCount, 3);
    assert.strictEqual(parsed.cooldownMs, 30000);
    assert.strictEqual(parsed.credential, 'KEY_1');
    assert.strictEqual(parsed.credentials, 'all-healthy');
    assert.strictEqual(parsed.credentialId, 'KEY_2');
    assert.strictEqual(parsed.keyCooldownMs, 15000);
  });

  test('credentials manager getHealthSummary() never exposes actual key strings', async () => {
    const { default: credManager } = await import('../src/credentials.js');
    const summary = credManager.getHealthSummary();

    assert.ok(Array.isArray(summary));
    for (const item of summary) {
      assert.ok('id' in item);
      assert.ok('healthy' in item);
      assert.strictEqual('key' in item, false);
      assert.doesNotMatch(JSON.stringify(item), /sk-or-v1/);
    }
  });

  test('config binds strictly to localhost (127.0.0.1) by default', async () => {
    const { default: config } = await import('../src/config.js');
    assert.strictEqual(config.host, '127.0.0.1');
    assert.notStrictEqual(config.host, '0.0.0.0');
  });
});
