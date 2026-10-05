import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

describe('System Integration & Edge Cases', () => {
  let upstreamServer;
  let gatewayServer;
  let upstreamPort;
  let gatewayPort;
  let upstreamResponder = (req, res) => res.end();

  before(async () => {
    // 1. Mock upstream server with configurable responses
    upstreamServer = http.createServer((req, res) => {
      upstreamResponder(req, res);
    });
    await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
    upstreamPort = upstreamServer.address().port;

    // 2. Set environment variables with low timeout & cooldown for fast tests
    process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}/api`;
    process.env.ROUTER_TOKEN = 'integration-test-token';
    process.env.OPENROUTER_KEY_1 = 'sk-or-v1-integration-key-1';
    process.env.OPENROUTER_KEY_2 = 'sk-or-v1-integration-key-2';
    process.env.KEY_COOLDOWN_MS = '200';
    process.env.REQUEST_TIMEOUT_MS = '300';

    // 3. Start gateway server
    const { createServer } = await import('../src/server.js');
    gatewayServer = createServer();
    await new Promise((r) => gatewayServer.listen(0, '127.0.0.1', r));
    gatewayPort = gatewayServer.address().port;
  });

  after(async () => {
    if (gatewayServer) await new Promise((r) => gatewayServer.close(r));
    if (upstreamServer) await new Promise((r) => upstreamServer.close(r));
  });

  test('enforces request timeout and returns HTTP 504 when upstream hangs', async () => {
    upstreamResponder = async (req, res) => {
      // Simulate hanging upstream response (longer than 300ms)
      await sleep(600);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer integration-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'timeout test' }),
    });

    assert.strictEqual(res.status, 504);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'timeout_error');
    assert.match(data.error.message, /timeout|exceeded/i);
  });

  test('returns 503 when all credentials are in cooldown', async () => {
    const { default: credManager } = await import('../src/credentials.js');

    // Force all credentials into cooldown
    credManager.markFailed('KEY_1');
    credManager.markFailed('KEY_2');

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer integration-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'cooldown test' }),
    });

    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'service_unavailable');
    assert.match(data.error.message, /No OpenRouter credentials configured or available/i);
  });

  test('recovers credential from cooldown after KEY_COOLDOWN_MS expires', async () => {
    const { default: credManager } = await import('../src/credentials.js');

    // Wait for the 200ms cooldown window to elapse
    await sleep(250);

    // Verify credential manager now returns a healthy credential again
    const cred = credManager.getCredential();
    assert.ok(cred !== null);
    assert.ok(cred.id === 'KEY_1' || cred.id === 'KEY_2');

    // Normal requests should succeed again
    upstreamResponder = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recovered: true }));
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer integration-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'recovered test' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.recovered, true);
  });

  test('supports graceful server startup and shutdown', async () => {
    const { createServer } = await import('../src/server.js');
    const tempServer = createServer();

    await new Promise((resolve) => tempServer.listen(0, '127.0.0.1', resolve));
    const port = tempServer.address().port;
    assert.ok(port > 0);

    const healthCheck = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(healthCheck.status, 200);

    // Clean shutdown
    await new Promise((resolve) => tempServer.close(resolve));

    // Verify server closed
    await assert.rejects(
      fetch(`http://127.0.0.1:${port}/health`),
      (err) => err.name === 'TypeError' || err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED'
    );
  });
});
