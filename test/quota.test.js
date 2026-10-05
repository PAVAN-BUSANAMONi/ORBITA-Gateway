import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

describe('Quota, Rate Limit, and Non-Transient Error Pass-Through', () => {
  let upstreamServer;
  let gatewayServer;
  let upstreamPort;
  let gatewayPort;
  const upstreamRequests = [];
  let upstreamHandler = (req, res) => res.end();

  before(async () => {
    // 1. Mock upstream server
    upstreamServer = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        upstreamRequests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        });
        upstreamHandler(req, res);
      });
    });
    await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
    upstreamPort = upstreamServer.address().port;

    // 2. Set environment variables with 2 credentials available
    process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}/api`;
    process.env.ROUTER_TOKEN = 'quota-test-token';
    process.env.OPENROUTER_KEY_1 = 'sk-or-v1-quota-key-1';
    process.env.OPENROUTER_KEY_2 = 'sk-or-v1-quota-key-2';

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

  beforeEach(() => {
    upstreamRequests.length = 0;
  });

  test('HTTP 429 Too Many Requests returns upstream response directly and NEVER triggers failover', async () => {
    upstreamHandler = (req, res) => {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '10',
      });
      res.end(
        JSON.stringify({
          error: {
            message: 'Rate limit exceeded: Please wait 10s',
            type: 'rate_limit_error',
            code: 429,
          },
        })
      );
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer quota-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.headers.get('retry-after'), '10');

    const data = await res.json();
    assert.strictEqual(data.error.code, 429);
    assert.strictEqual(data.error.type, 'rate_limit_error');

    // CRITICAL: Exactly 1 upstream attempt was made; no credential rotation attempted
    assert.strictEqual(upstreamRequests.length, 1);
  });

  test('HTTP 402 Payment Required returns upstream response directly and NEVER triggers failover', async () => {
    upstreamHandler = (req, res) => {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message: 'Insufficient credits on OpenRouter account',
            type: 'insufficient_quota',
          },
        })
      );
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer quota-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 402);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'insufficient_quota');

    // CRITICAL: Exactly 1 upstream attempt was made; no credential rotation attempted
    assert.strictEqual(upstreamRequests.length, 1);
  });

  test('HTTP 403 Forbidden with account limits passes through without failover', async () => {
    upstreamHandler = (req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message: 'User account spending limit reached',
            type: 'account_limit',
          },
        })
      );
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer quota-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'test' }),
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'account_limit');
    assert.strictEqual(upstreamRequests.length, 1);
  });

  test('Standard client errors (400, 401, 404) pass through directly without rotation', async () => {
    const errorCodes = [400, 401, 404];

    for (const code of errorCodes) {
      upstreamRequests.length = 0;
      upstreamHandler = (req, res) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code } }));
      };

      const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer quota-test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'test' }),
      });

      assert.strictEqual(res.status, code);
      assert.strictEqual(upstreamRequests.length, 1);
    }
  });
});
