import { redis, connectRedis } from '../../src/db/redis';
import { issueOtp, verifyOtp, MAX_OTP_ATTEMPTS } from '../../src/services/otp';

describe('OTP wrong-attempt limit (real Redis)', () => {
  const email = `otp-attempts-${Date.now()}@example.com`;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  function wrongCodeFor(code: string) {
    return code === '000000' ? '000001' : '000000';
  }

  it('burns the code after MAX_OTP_ATTEMPTS wrong guesses — even the right code stops working', async () => {
    const code = await issueOtp('customer_login', email);
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect(await verifyOtp('customer_login', email, wrongCodeFor(code))).toBe(false);
    }
    expect(await verifyOtp('customer_login', email, code)).toBe(false);
  });

  it('still accepts the right code after a few typos, and a new code gets a fresh budget', async () => {
    const first = await issueOtp('customer_login', email);
    for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await verifyOtp('customer_login', email, wrongCodeFor(first));
    }
    const second = await issueOtp('customer_login', email);
    for (let i = 0; i < MAX_OTP_ATTEMPTS - 1; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await verifyOtp('customer_login', email, wrongCodeFor(second));
    }
    expect(await verifyOtp('customer_login', email, second)).toBe(true);
    // Single use.
    expect(await verifyOtp('customer_login', email, second)).toBe(false);
  });
});
