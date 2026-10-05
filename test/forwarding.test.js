import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

describe('Request Forwarding & Header Isolation', () => {
  let upstreamServer;
  let gatewayServer;
  let upstreamPort;
  let gatewayPort;
  const receivedRequests = [];

  before(async () => {
    // 1. Mock upstream server capturing incoming requests
    upstreamServer = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        receivedRequests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'forwarded' }));
      });
    });
    await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
    upstreamPort = upstreamServer.address().port;

    // 2. Set environment variables
    process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}/api`;
    process.env.ROUTER_TOKEN = 'local-secret-pass';
    process.env.OPENROUTER_KEY_1 = 'sk-or-v1-my-upstream-key-999';

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

  test('strips incoming client Host header and uses upstream host', async () => {
    receivedRequests.length = 0;
    await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer local-secret-pass',
        Host: `127.0.0.1:${gatewayPort}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'host-check' }),
    });

    assert.strictEqual(receivedRequests.length, 1);
    const upstreamReq = receivedRequests[0];
    assert.notStrictEqual(upstreamReq.headers['host'], `127.0.0.1:${gatewayPort}`);
    assert.strictEqual(upstreamReq.headers['host'], `127.0.0.1:${upstreamPort}`);
  });

  test('never forwards local ROUTER_TOKEN or x-api-key upstream', async () => {
    receivedRequests.length = 0;
    await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': 'local-secret-pass',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'auth-strip-check' }),
    });

    assert.strictEqual(receivedRequests.length, 1);
    const upstreamReq = receivedRequests[0];
    assert.strictEqual(upstreamReq.headers['x-api-key'], undefined);
    assert.doesNotMatch(JSON.stringify(upstreamReq.headers), /local-secret-pass/);
  });

  test('injects OpenRouter Authorization Bearer credential', async () => {
    receivedRequests.length = 0;
    await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer local-secret-pass',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'key-injection' }),
    });

    assert.strictEqual(receivedRequests.length, 1);
    const upstreamReq = receivedRequests[0];
    assert.strictEqual(
      upstreamReq.headers['authorization'],
      'Bearer sk-or-v1-my-upstream-key-999'
    );
  });

  test('preserves request body exactly', async () => {
    receivedRequests.length = 0;
    const testPayload = {
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      messages: [{ role: 'user', content: 'Generate code for gateway' }],
      max_tokens: 1024,
      stream: false,
    };

    await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer local-secret-pass',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    assert.strictEqual(receivedRequests.length, 1);
    const upstreamReq = receivedRequests[0];
    assert.deepStrictEqual(JSON.parse(upstreamReq.body), testPayload);
  });

  test('preserves Anthropic specific headers', async () => {
    receivedRequests.length = 0;
    await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer local-secret-pass',
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-04-04,prompt-caching-2024-07-31',
      },
      body: JSON.stringify({ test: 'headers' }),
    });

    assert.strictEqual(receivedRequests.length, 1);
    const upstreamReq = receivedRequests[0];
    assert.strictEqual(upstreamReq.headers['anthropic-version'], '2023-06-01');
    assert.strictEqual(
      upstreamReq.headers['anthropic-beta'],
      'tools-2024-04-04,prompt-caching-2024-07-31'
    );
  });

  test('preserves HTTP method and target URL path', async () => {
    receivedRequests.length = 0;

    // Test GET /v1/models
    await fetch(`http://127.0.0.1:${gatewayPort}/v1/models`, {
      method: 'GET',
      headers: { Authorization: 'Bearer local-secret-pass' },
    });

    assert.strictEqual(receivedRequests.length, 1);
    assert.strictEqual(receivedRequests[0].method, 'GET');
    assert.strictEqual(receivedRequests[0].url, '/api/v1/models');
  });
});
