import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { verifyCashfreeWebhookSignature } from '../services/cashfreeWebhookSignature';
import { processCashfreeWebhook } from '../services/cashfreeOrders';

export const webhooksRouter = Router();

// req.body is a raw Buffer here, not parsed JSON — see app.ts, where
// this router is mounted with express.raw() ahead of the global
// express.json(). Signature verification needs the exact bytes Cashfree
// sent; parsing and re-serializing the body first (even just to check
// it, then discarding that) risks exactly the kind of decimal
// reformatting Cashfree's own docs warn breaks the signature.
webhooksRouter.post('/cashfree', asyncHandler(async (req, res) => {
  const rawBody = (req.body as Buffer).toString('utf8');
  const timestamp = req.header('x-webhook-timestamp');
  const signature = req.header('x-webhook-signature');

  if (!timestamp || !signature) {
    res.status(400).json({ error: 'Missing webhook signature headers' });
    return;
  }

  let isValid: boolean;
  try {
    isValid = verifyCashfreeWebhookSignature(rawBody, timestamp, signature);
  } catch {
    // CASHFREE_SECRET_KEY missing — a configuration problem on our end,
    // not something to report back to Cashfree as if their webhook was
    // rejected for being invalid.
    res.status(500).json({ error: 'Webhook verification is not configured' });
    return;
  }

  if (!isValid) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  const payload = JSON.parse(rawBody);
  await processCashfreeWebhook(payload);

  res.status(200).json({ received: true });
}));
