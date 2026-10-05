import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import config from './config.js';
import logger from './logger.js';
import { handleHealth } from './health.js';
import { handleRequest } from './router.js';

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

      // Public health check endpoint
      if (req.method === 'GET' && url.pathname === '/health') {
        return handleHealth(res);
      }

      // Proxy all other requests through router
      await handleRequest(req, res);
    } catch (err) {
      logger.error('Unhandled server error', { error: err.message });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message: 'Internal server error',
              type: 'internal_error',
            },
          })
        );
      }
    }
  });
}

export function startServer() {
  const server = createServer();

  server.listen(config.port, config.host, () => {
    logger.info(`ORBITA-Gateway listening on http://${config.host}:${config.port}`);
  });

  function shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('Server stopped.');
      process.exit(0);
    });

    // Force exit after 5 seconds if lingering connections exist
    setTimeout(() => {
      logger.warn('Forcing server shutdown after timeout.');
      process.exit(1);
    }, 5000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  const scriptPath = process.argv[1].replace(/\\/g, '/');
  if (import.meta.url.endsWith(scriptPath)) return true;
  try {
    return fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();
  } catch {
    return false;
  }
}

// Start automatically when executed directly as main script
if (isDirectRun()) {
  startServer();
}

export default { createServer, startServer };
