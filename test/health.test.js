import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('GET /health endpoint', () => {
  let server;
  let serverPort;

  before(async () => {
    process.env.ROUTER_TOKEN = 'test-router-token';
    const { createServer } = await import('../src/server.js');
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    serverPort = server.address().port;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('returns 200 OK without any authentication header', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');
  });

  test('returns correct JSON payload structure', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    const data = await res.json();

    assert.strictEqual(data.service, 'ORBITA-Gateway');
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(typeof data.uptime, 'number');
    assert.ok(data.uptime >= 0);
    assert.strictEqual(typeof data.credentials, 'number');
    assert.ok(data.credentials >= 0);
  });

  test('never leaks credentials or keys in health output', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    const text = await res.text();

    assert.doesNotMatch(text, /sk-or-v1/);
    assert.doesNotMatch(text, /Bearer/);
    assert.doesNotMatch(text, /key/i);
  });
});
