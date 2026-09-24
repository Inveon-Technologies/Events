import { Writable } from 'stream';
import express from 'express';
import request from 'supertest';
import pino from 'pino';
import { loggerOptions } from '../src/logger';
import { createApp } from '../src/app';
import { createRequestLogger } from '../src/middleware/requestLogger';

function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(String(chunk)));
      cb();
    },
  });
  return { log: pino({ ...loggerOptions, level: 'info' }, stream), lines };
}

describe('structured logging', () => {
  it('writes JSON lines with level, time, service and message', () => {
    const { log, lines } = captureLogger();
    log.info({ bookingReference: 'INV-BKG-2026-ABCD2345' }, 'Booking confirmed');
    expect(lines[0]).toMatchObject({ level: 30, service: 'inveon-events-api', msg: 'Booking confirmed', bookingReference: 'INV-BKG-2026-ABCD2345' });
    expect(typeof lines[0].time).toBe('string');
  });

  it('redacts secrets and credentials', () => {
    const { log, lines } = captureLogger();
    log.info({ password: 'hunter2', appSecret: 'isk_x', code: '123456', body: { password: 'p', bankAccountNumber: '1234567890' }, req: { headers: { authorization: 'Bearer abc' } } }, 'x');
    const text = JSON.stringify(lines[0]);
    for (const secret of ['hunter2', 'isk_x', '123456', '1234567890', 'Bearer abc']) expect(text).not.toContain(secret);
  });

  it('every response carries a request id, reusing a safe incoming one', async () => {
    const app = createApp();
    const fresh = await request(app).get('/health');
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const reused = await request(app).get('/health').set('X-Request-Id', 'nginx-abc-123');
    expect(reused.headers['x-request-id']).toBe('nginx-abc-123');

    const unsafe = await request(app).get('/health').set('X-Request-Id', 'bad id <script>');
    expect(unsafe.headers['x-request-id']).not.toContain('<');
  });

  it('logs the path without the query string (which can contain emails)', async () => {
    const { log, lines } = captureLogger();
    const app = express();
    app.use(createRequestLogger(log));
    app.get('/api/bookings/:ref/tickets', (_req, res) => {
      res.status(200).end();
    });
    await request(app).get('/api/bookings/INV-1/tickets?email=private@example.com');
    const text = JSON.stringify(lines);
    expect(text).toContain('/api/bookings/INV-1/tickets');
    expect(text).not.toContain('private@example.com');
    expect(lines.find((l) => l.msg === 'request completed')).toMatchObject({ res: { statusCode: 200 }, req: { method: 'GET' } });
  });
});
