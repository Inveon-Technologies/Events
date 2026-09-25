import { logger } from '../../logger';

// WhatsApp notifications. Two interchangeable providers behind one
// function, chosen by WHATSAPP_PROVIDER:
//   - "aisensy": AiSensy's API campaigns (a Meta BSP; templates and one
//     "API campaign" per template are set up in their dashboard);
//   - "meta": Meta's WhatsApp Cloud API directly, no middleman fee.
// Moving between them is an env change — see docs/ops/WHATSAPP.md.
// Unset (the default) means WhatsApp is off and nothing is sent.

export type WhatsAppProvider = 'aisensy' | 'meta';

// One entry per message the app sends. The value is the default template
// name (Meta) / API campaign name (AiSensy); each can be overridden, e.g.
// WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmation_v2.
export const WHATSAPP_MESSAGES = {
  bookingConfirmation: 'booking_confirmation',
  eventReminder: 'event_reminder',
  bookingCancelled: 'booking_cancelled',
  postEventThanks: 'post_event_thanks',
  certificateReady: 'certificate_ready',
} as const;
export type WhatsAppMessage = keyof typeof WHATSAPP_MESSAGES;

export class WhatsAppNotConfiguredError extends Error {}
export class WhatsAppInvalidNumberError extends Error {}
export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function whatsAppProvider(): WhatsAppProvider | null {
  const provider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (provider === 'aisensy' && process.env.AISENSY_API_KEY) return 'aisensy';
  if (provider === 'meta' && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) return 'meta';
  return null;
}

export function isWhatsAppConfigured(): boolean {
  return whatsAppProvider() !== null;
}

function envKey(message: WhatsAppMessage): string {
  return `WHATSAPP_TEMPLATE_${message.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
}

export function templateName(message: WhatsAppMessage): string {
  return process.env[envKey(message)]?.trim() || WHATSAPP_MESSAGES[message];
}

// Numbers are typed freely at checkout ("98765 43210", "+91-98765-43210",
// "098765 43210"). Both providers want digits with the country code and no
// "+". A bare 10-digit number is taken as Indian.
export function normalizeWhatsAppNumber(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) {
    throw new WhatsAppInvalidNumberError(`Not a usable WhatsApp number: "${raw}"`);
  }
  return digits;
}

// Meta rejects template parameters that are empty or contain newlines,
// tabs or more than four consecutive spaces — AiSensy passes them to Meta
// as is, so both get the same clean-up.
function cleanParam(value: string): string {
  const cleaned = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return (cleaned || '-').slice(0, 1000);
}

const TIMEOUT_MS = 15_000;

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text for the error message.
  }
  if (!res.ok) {
    const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    throw new WhatsAppApiError(`WhatsApp provider returned ${res.status}: ${detail.slice(0, 500)}`, res.status);
  }
  return parsed;
}

export interface SendTemplateParams {
  message: WhatsAppMessage;
  to: string;
  // Shown in AiSensy's inbox as the contact name.
  recipientName: string;
  // In the order of the template's {{1}}, {{2}}, …
  params: string[];
  // Public URL of the header image, for templates with an image header.
  headerImage?: { url: string; filename: string };
  // The variable part of each URL button, in button order (a dynamic URL
  // button's variable is always the end of its URL).
  urlButtons?: string[];
}

// Throws on failure so the job queue retries it (see queue/jobs.ts).
export async function sendWhatsAppTemplate({
  message,
  to,
  recipientName,
  params,
  headerImage,
  urlButtons = [],
}: SendTemplateParams): Promise<void> {
  const provider = whatsAppProvider();
  if (!provider) throw new WhatsAppNotConfiguredError('WhatsApp is not configured (WHATSAPP_PROVIDER)');

  const destination = normalizeWhatsAppNumber(to);
  const name = templateName(message);
  const values = params.map(cleanParam);

  if (provider === 'aisensy') {
    await postJson(process.env.AISENSY_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2', {
      apiKey: process.env.AISENSY_API_KEY,
      campaignName: name,
      destination,
      userName: cleanParam(recipientName),
      templateParams: values,
      source: 'inveon-events',
      ...(headerImage ? { media: headerImage } : {}),
      ...(urlButtons.length
        ? {
            buttons: urlButtons.map((text, i) => ({
              type: 'button',
              sub_type: 'url',
              index: String(i),
              parameters: [{ type: 'text', text }],
            })),
          }
        : {}),
    });
  } else {
    const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';
    await postJson(
      `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: destination,
        type: 'template',
        template: {
          name,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' },
          components: [
            ...(headerImage ? [{ type: 'header', parameters: [{ type: 'image', image: { link: headerImage.url } }] }] : []),
            ...(values.length ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] : []),
            ...urlButtons.map((text, i) => ({ type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text }] })),
          ],
        },
      },
      { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
    );
  }

  logger.info({ provider, template: name, to: `…${destination.slice(-4)}` }, 'WhatsApp message sent');
}
