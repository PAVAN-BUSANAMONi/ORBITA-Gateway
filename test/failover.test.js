import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

describe('Transient Failure & Failover Routing', () => {
  let upstreamServer;
  let gatewayServer;
  let upstreamPort;
  let gatewayPort;
  let credManager;
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

    // 2. Set environment variables with 2 credentials
    process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}/api`;
    process.env.ROUTER_TOKEN = 'failover-test-token';
    process.env.OPENROUTER_KEY_1 = 'sk-or-v1-primary-key';
    process.env.OPENROUTER_KEY_2 = 'sk-or-v1-backup-key';
    process.env.KEY_COOLDOWN_MS = '2000';

    // 3. Start gateway server
    const { createServer } = await import('../src/server.js');
    const { default: cm } = await import('../src/credentials.js');
    credManager = cm;

    gatewayServer = createServer();
    await new Promise((r) => gatewayServer.listen(0, '127.0.0.1', r));
    gatewayPort = gatewayServer.address().port;
  });

  after(async () => {
    if (credManager) credManager.reset();
    if (gatewayServer) await new Promise((r) => gatewayServer.close(r));
    if (upstreamServer) await new Promise((r) => upstreamServer.close(r));
  });

  beforeEach(() => {
    upstreamRequests.length = 0;
    if (credManager) {
      credManager.reset();
    }
  });

  const transientStatusCodes = [408, 500, 502, 503, 504];

  for (const statusCode of transientStatusCodes) {
    test(`fails over to alternate credential when upstream returns ${statusCode}`, async () => {
      let attempts = 0;
      upstreamHandler = (req, res) => {
        attempts++;
        if (attempts === 1) {
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Transient ${statusCode}` }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, attempt: attempts }));
        }
      };

      const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer failover-test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: `failover-${statusCode}` }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.attempt, 2);

      // Verify exactly 2 upstream attempts: 1st with KEY_1, 2nd with KEY_2
      assert.strictEqual(upstreamRequests.length, 2);
      assert.strictEqual(
        upstreamRequests[0].headers['authorization'],
        'Bearer sk-or-v1-primary-key'
      );
      assert.strictEqual(
        upstreamRequests[1].headers['authorization'],
        'Bearer sk-or-v1-backup-key'
      );
    });
  }

  test('fails over to alternate credential on upstream network connection error', async () => {
    let attempts = 0;
    upstreamHandler = (req, res) => {
      attempts++;
      if (attempts === 1) {
        req.socket.destroy();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, attempt: attempts }));
      }
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer failover-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'network-failover' }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.attempt, 2);
    assert.strictEqual(upstreamRequests.length, 2);
    assert.strictEqual(
      upstreamRequests[0].headers['authorization'],
      'Bearer sk-or-v1-primary-key'
    );
    assert.strictEqual(
      upstreamRequests[1].headers['authorization'],
      'Bearer sk-or-v1-backup-key'
    );
  });

  test('enforces maximum ONE alternate attempt when both credentials fail (no infinite loops)', async () => {
    upstreamHandler = (req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'System persistently down' }));
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer failover-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'max-attempts-check' }),
    });

    // Should return the upstream 503 from the alternate attempt
    assert.strictEqual(res.status, 503);

    // Exactly 2 attempts (primary + 1 alternate), no third attempt
    assert.strictEqual(upstreamRequests.length, 2);
    assert.strictEqual(
      upstreamRequests[0].headers['authorization'],
      'Bearer sk-or-v1-primary-key'
    );
    assert.strictEqual(
      upstreamRequests[1].headers['authorization'],
      'Bearer sk-or-v1-backup-key'
    );
  });

  test('returns HTTP 502 Bad Gateway when all attempts fail with network connection error', async () => {
    upstreamHandler = (req, res) => {
      req.socket.destroy();
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer failover-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'network-double-failure' }),
    });

    assert.strictEqual(res.status, 502);
    const data = await res.json();
    assert.strictEqual(data.error.type, 'upstream_connection_error');
    assert.strictEqual(upstreamRequests.length, 2);
  });
});
