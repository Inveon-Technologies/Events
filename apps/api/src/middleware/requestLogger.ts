import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import { logger } from '../logger';

// One log line per request (method, path, status, duration) with a
// request id that's also returned as X-Request-Id, so a user-reported
// error can be matched to its server log. An incoming X-Request-Id from
// the proxy is reused so ids line up across nginx and the API.
export function createRequestLogger(log: Logger) {
  return pinoHttp({
    logger: log,
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && /^[\w-]{1,100}$/.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // Health checks run every few seconds; logging them is pure noise.
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/api/health' },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    serializers: {
      // Path only — query strings can carry emails (e.g. ticket lookups).
      req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
}

export const requestLogger = createRequestLogger(logger);
