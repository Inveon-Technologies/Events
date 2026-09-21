import crypto from 'crypto';
import { verifyCashfreeWebhookSignature } from '../src/services/cashfreeWebhookSignature';

describe('Cashfree webhook signature verification', () => {
  const secret = 'test-cashfree-secret-key';
  const originalEnv = process.env.CASHFREE_SECRET_KEY;

  beforeEach(() => {
    process.env.CASHFREE_SECRET_KEY = secret;
  });

  afterAll(() => {
    process.env.CASHFREE_SECRET_KEY = originalEnv;
  });

  function realSignature(timestamp: string, rawBody: string): string {
    return crypto.createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');
  }

  it('accepts a correctly computed signature', () => {
    const rawBody = '{"data":{"order":{"order_id":"INV-BKG-2026-12345"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';
    const timestamp = '1746427759733';
    const signature = realSignature(timestamp, rawBody);

    expect(verifyCashfreeWebhookSignature(rawBody, timestamp, signature)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret (forged webhook)', () => {
    const rawBody = '{"data":{"order":{"order_id":"INV-BKG-2026-12345"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';
    const timestamp = '1746427759733';
    const forgedSignature = crypto.createHmac('sha256', 'wrong-secret').update(timestamp + rawBody).digest('base64');

    expect(verifyCashfreeWebhookSignature(rawBody, timestamp, forgedSignature)).toBe(false);
  });

  it('rejects when the body has been tampered with after signing', () => {
    const originalBody = '{"data":{"order":{"order_id":"INV-BKG-2026-12345"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';
    const timestamp = '1746427759733';
    const signature = realSignature(timestamp, originalBody);

    const tamperedBody = '{"data":{"order":{"order_id":"INV-BKG-2026-99999"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';
    expect(verifyCashfreeWebhookSignature(tamperedBody, timestamp, signature)).toBe(false);
  });

  it('rejects when the timestamp has been changed (replay with a different timestamp)', () => {
    const rawBody = '{"data":{"order":{"order_id":"INV-BKG-2026-12345"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}';
    const timestamp = '1746427759733';
    const signature = realSignature(timestamp, rawBody);

    expect(verifyCashfreeWebhookSignature(rawBody, '1746427759999', signature)).toBe(false);
  });

  it('rejects a garbage/malformed signature without throwing', () => {
    const rawBody = '{"data":{}}';
    const timestamp = '1746427759733';
    expect(verifyCashfreeWebhookSignature(rawBody, timestamp, 'not-a-real-signature')).toBe(false);
    expect(verifyCashfreeWebhookSignature(rawBody, timestamp, '')).toBe(false);
  });

  it('throws a clear error if CASHFREE_SECRET_KEY is not configured, rather than silently accepting anything', () => {
    delete process.env.CASHFREE_SECRET_KEY;
    expect(() => verifyCashfreeWebhookSignature('{}', '123', 'sig')).toThrow(/CASHFREE_SECRET_KEY/);
  });
});
