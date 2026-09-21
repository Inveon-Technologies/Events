import crypto from 'crypto';

// Matches Cashfree's own documented algorithm exactly (verified against
// their live docs, not recalled from memory): concatenate the
// x-webhook-timestamp header and the RAW request body (no separator,
// and never a re-serialized/parsed version of the body — Cashfree's own
// docs warn this can shift decimal formatting and break the signature),
// HMAC-SHA256 with the client secret, base64-encode, compare to
// x-webhook-signature.
export function verifyCashfreeWebhookSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('CASHFREE_SECRET_KEY is not set (see .env.example)');
  }
  const signatureData = timestamp + rawBody;
  const computedSignature = crypto.createHmac('sha256', secretKey).update(signatureData).digest('base64');

  // Timing-safe comparison — a plain === would leak how many leading
  // bytes matched through response-time differences, letting an
  // attacker forge a valid signature byte by byte.
  const computedBuffer = Buffer.from(computedSignature);
  const receivedBuffer = Buffer.from(signature);
  if (computedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(computedBuffer, receivedBuffer);
}
