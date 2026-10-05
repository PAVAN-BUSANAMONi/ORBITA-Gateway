import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';

describe('Streaming & SSE Fidelity', () => {
  let upstreamServer;
  let gatewayServer;
  let upstreamPort;
  let gatewayPort;
  let upstreamHandler;

  const defaultSSEHandler = async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'x-custom-stream-header': 'stream-test',
    });

    res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
    await sleep(40);
    res.write('event: content_block_delta\ndata: {"delta":{"text":"Hello"}}\n\n');
    await sleep(40);
    res.write('event: content_block_delta\ndata: {"delta":{"text":" World"}}\n\n');
    await sleep(40);
    res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    res.end();
  };

  before(async () => {
    // 1. Mock upstream server with configurable handler
    upstreamHandler = defaultSSEHandler;
    upstreamServer = http.createServer(async (req, res) => {
      await upstreamHandler(req, res);
    });
    await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
    upstreamPort = upstreamServer.address().port;

    // 2. Set environment variables
    process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}/api`;
    process.env.ROUTER_TOKEN = 'stream-token-xyz';
    process.env.OPENROUTER_KEY_1 = 'sk-or-v1-stream-key';

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
    upstreamHandler = defaultSSEHandler;
  });

  test('preserves SSE Content-Type and headers downstream', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer stream-token-xyz',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stream: true }),
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
    assert.strictEqual(res.headers.get('cache-control'), 'no-cache');
    assert.strictEqual(res.headers.get('x-custom-stream-header'), 'stream-test');
  });

  test('receives chunks incrementally without full-response buffering', async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer stream-token-xyz',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stream: true }),
    });

    assert.strictEqual(res.status, 200);

    const chunkTimestamps = [];
    const chunks = [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunkTimestamps.push(Date.now());
      chunks.push(decoder.decode(value));
    }

    const fullText = chunks.join('');

    // Must have received multiple separate chunks over time
    assert.ok(
      chunks.length >= 3,
      `Expected >= 3 chunks, got ${chunks.length}`
    );

    // Verify delay between first chunk and last chunk reflects incremental streaming (>80ms)
    const totalStreamingDuration =
      chunkTimestamps[chunkTimestamps.length - 1] - chunkTimestamps[0];
    assert.ok(
      totalStreamingDuration >= 80,
      `Expected unbuffered streaming duration >= 80ms, was ${totalStreamingDuration}ms`
    );

    // Verify complete content fidelity
    assert.match(fullText, /message_start/);
    assert.match(fullText, /Hello/);
    assert.match(fullText, /World/);
    assert.match(fullText, /message_stop/);
  });

  test('regression: handles gzip-compressed upstream JSON without double-decompression ZlibError', async () => {
    upstreamHandler = (req, res) => {
      const payload = JSON.stringify({
        id: 'msg_decomp_test',
        type: 'message',
        content: [{ type: 'text', text: 'Decompressed payload works' }],
      });
      const gzipped = zlib.gzipSync(payload);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Content-Length': gzipped.length,
      });
      res.end(gzipped);
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer stream-token-xyz',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      body: JSON.stringify({ prompt: 'test compression' }),
    });

    assert.strictEqual(res.status, 200);
    // Downstream must NOT have Content-Encoding or Content-Length forwarded
    assert.strictEqual(res.headers.get('content-encoding'), null);
    assert.strictEqual(res.headers.get('content-length'), null);

    // Body must parse cleanly without ZlibError
    const data = await res.json();
    assert.strictEqual(data.id, 'msg_decomp_test');
    assert.strictEqual(data.content[0].text, 'Decompressed payload works');
  });

  test('regression: handles gzip-compressed upstream SSE stream without ZlibError', async () => {
    upstreamHandler = (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Content-Encoding': 'gzip',
      });
      const gzip = zlib.createGzip();
      gzip.pipe(res);
      gzip.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      gzip.write('event: content_block_delta\ndata: {"delta":{"text":"Compressed SSE chunk"}}\n\n');
      gzip.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      gzip.end();
    };

    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer stream-token-xyz',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      body: JSON.stringify({ stream: true }),
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-encoding'), null);
    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');

    const text = await res.text();
    assert.match(text, /message_start/);
    assert.match(text, /Compressed SSE chunk/);
    assert.match(text, /message_stop/);
  });
});
