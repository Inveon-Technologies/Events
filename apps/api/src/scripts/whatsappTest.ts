import { sequelize } from '../db/connection';
import { Booking, Event } from '../models';
import { buildWhatsAppMessage } from '../services/whatsapp/messages';
import {
  normalizeWhatsAppNumber,
  sendWhatsAppTemplate,
  templateName,
  whatsAppProvider,
  WHATSAPP_MESSAGES,
  type WhatsAppMessage,
} from '../services/whatsapp/client';

// Sends each WhatsApp template once to a test number, to check the
// provider setup end to end (docs/ops/WHATSAPP.md, step 8):
//
//   docker compose exec events-api node dist/scripts/whatsappTest.js 919922565938
//   docker compose exec events-api node dist/scripts/whatsappTest.js 919922565938 --booking INV-BKG-2026-XXXXXXXX
//   (development: npm run whatsapp:test -- 919922565938)
//
// Without --booking the messages carry sample values, and the ticket
// message uses the sample ticket picture from the website. With --booking
// the ticket message is the real one for that booking (its ticket card
// and working View Ticket / PDF buttons), sent to the test number instead
// of the customer's.

const SAMPLE_REF = 'INV-BKG-2026-8F3K2Q';

function publicBase(): string {
  return (process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
}

function samples(): Record<WhatsAppMessage, { params: string[]; headerImage?: { url: string; filename: string }; urlButtons?: string[] }> {
  const base = publicBase();
  return {
    bookingConfirmation: {
      params: [
        'Rahul',
        'Rajgad Sunrise Trek',
        'Your payment has been verified and your ticket is ready.',
        'Saturday, 18 October 2026',
        'Reporting time: 5:30 AM',
        'Pune → Rajgad',
        'INV-TKT-2026-8F3K2Q-01',
        SAMPLE_REF,
        'Eco Pandhari Club: 0788 750 3856',
      ],
      headerImage: { url: `${base}/images/whatsapp-sample-card.jpg`, filename: 'ticket.jpg' },
      urlButtons: [`${SAMPLE_REF}.sample`, `${SAMPLE_REF}.sample`],
    },
    eventReminder: {
      params: [
        'Rahul',
        'Rajgad Sunrise Trek',
        '6:30 am',
        'Gunjavane village, Pune',
        'https://www.google.com/maps/search/?api=1&query=Gunjavane',
        SAMPLE_REF,
      ],
    },
    bookingCancelled: {
      params: ['Rahul', SAMPLE_REF, 'Rajgad Sunrise Trek', 'This is a test message — nothing was cancelled.'],
    },
    postEventThanks: {
      params: [
        'Rahul',
        'Rajgad Sunrise Trek',
        'Eco Pandhari Club',
        'See the photos and videos here: https://drive.google.com/',
        `${base || 'https://events.inveontechnologies.in'}/bookings/${SAMPLE_REF}/feedback`,
      ],
    },
  };
}

function hint(message: string): string {
  if (/campaign/i.test(message)) return 'Check the API campaign exists with exactly this name and is Live (step 6).';
  if (/template/i.test(message)) return 'Check the template is Approved and its {{…}} count matches (step 5).';
  if (/media|image|download/i.test(message)) return 'WhatsApp could not fetch the picture — open the image URL above on a phone; it must load over HTTPS.';
  if (/401|403|api ?key|unauthori/i.test(message)) return 'The API key is wrong or revoked (step 7).';
  return '';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const bookingAt = args.indexOf('--booking');
  const bookingRef = bookingAt >= 0 ? args[bookingAt + 1] : undefined;
  // The rest is the phone number, even when typed with spaces ("+91 99225 65938").
  const to = args.filter((a, i) => !a.startsWith('--') && (bookingAt < 0 || i !== bookingAt + 1)).join('');

  if (!to) {
    console.error('Usage: node dist/scripts/whatsappTest.js <phone, e.g. 919922565938> [--booking INV-BKG-…]');
    process.exit(2);
  }
  const provider = whatsAppProvider();
  if (!provider) {
    console.error('WhatsApp is not configured: set WHATSAPP_PROVIDER=aisensy and AISENSY_API_KEY (or the Meta settings) in apps/api/.env, then restart.');
    process.exit(2);
  }
  if (!publicBase()) {
    console.error('WEB_PUBLIC_URL is not set — the ticket picture and buttons need the public site address.');
    process.exit(2);
  }
  const number = normalizeWhatsAppNumber(to);
  console.log(`Provider: ${provider} · sending to +${number} · site: ${publicBase()}\n`);

  const payloads = samples();
  if (bookingRef) {
    const booking = await Booking.findOne({ where: { bookingReference: bookingRef.trim().toUpperCase() } });
    const event = booking ? await Event.findByPk(booking.eventId) : null;
    if (!booking || !event) {
      console.error(`Booking ${bookingRef} not found.`);
      process.exit(2);
    }
    const built = await buildWhatsAppMessage('bookingConfirmation', booking, event);
    if (built) payloads.bookingConfirmation = { params: built.params, headerImage: built.headerImage, urlButtons: built.urlButtons };
  }

  let failed = 0;
  for (const message of Object.keys(WHATSAPP_MESSAGES) as WhatsAppMessage[]) {
    const p = payloads[message];
    const label = `${templateName(message)}`.padEnd(22);
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendWhatsAppTemplate({ message, to: number, recipientName: 'Test', ...p });
      console.log(`✓ ${label} sent${p.headerImage ? ` (picture: ${p.headerImage.url})` : ''}`);
    } catch (err) {
      failed += 1;
      const text = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${label} ${text}`);
      const h = hint(text);
      if (h) console.log(`  → ${h}`);
    }
  }
  console.log(failed ? `\n${failed} of 4 failed.` : '\nAll 4 sent — check WhatsApp on the test phone.');
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close().catch(() => undefined));
