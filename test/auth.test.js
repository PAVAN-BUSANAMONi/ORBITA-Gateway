import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

describe('Local Authentication Guard', () => {
  let upstreamServer;
  let gatewayServer;
  let upstreamPort;
  let gatewayPort;

  before(async () => {
    // 1. Mock upstream server
    upstreamServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
    upstreamPort = upstreamServer.address().port;

    // 2. Set environment variables
    process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}/api`;
    process.env.ROUTER_TOKEN = 'secret-local-token-123';
    process.env.OPENROUTER_KEY_1 = 'sk-or-v1-mock-auth-key';

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

  test('rejects request with missing authentication headers with 401', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'authentication_error');
    assert.match(data.error.message, /Missing or invalid local router authentication/i);
  });

  test('rejects request with invalid Authorization Bearer token with 401', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-password-xyz',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'authentication_error');
  });

  test('rejects request with invalid x-api-key token with 401', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': 'wrong-password-xyz',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'authentication_error');
  });

  test('accepts valid Authorization Bearer <ROUTER_TOKEN>', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret-local-token-123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
  });

  test('accepts valid raw Authorization <ROUTER_TOKEN>', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'secret-local-token-123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
  });

  test('accepts valid x-api-key: <ROUTER_TOKEN>', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': 'secret-local-token-123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
  });
});
