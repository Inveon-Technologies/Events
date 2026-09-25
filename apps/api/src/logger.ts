import pino from 'pino';

// One structured (JSON) logger for the whole API: every line is a JSON
// object with a level, time, message and context fields, so logs can be
// searched and aggregated (docker logs / any log shipper) instead of
// grepping free text. Secrets and personal data never reach the logs.
export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'inveon-events-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-app-secret"]',
      'req.headers["x-webhook-signature"]',
      'password',
      'newPassword',
      'currentPassword',
      'appSecret',
      'code',
      'otp',
      '*.password',
      '*.appSecret',
      '*.bankAccountNumber',
      '*.panNumber',
    ],
    censor: '[redacted]',
  },
};

export const logger = pino(loggerOptions);

// When email isn't configured, a sign-in/reset code has no way to reach
// the user — in development it's logged so the flow can still be tested.
// Never in production: a code in the logs is a working credential.
export function logOtpForDevelopment(purpose: string, email: string, code: string): void {
  if (process.env.NODE_ENV === 'production') {
    logger.error({ purpose }, 'Email is not configured — a one-time code could not be delivered');
    return;
  }
  logger.warn({ purpose, email, code }, 'Email not configured — one-time code (development only)');
}
