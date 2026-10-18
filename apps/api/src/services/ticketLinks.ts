import { createHmac, timingSafeEqual } from 'node:crypto';

// Each booking's ticket page is reachable at /t/<token> without logging in
// — that's the link in the WhatsApp message and emails. The token is the
// booking reference plus an HMAC of it, so it can't be guessed or built
// from a reference alone, and needs no database column. Changing
// TICKET_LINK_SECRET (or JWT_SECRET, its fallback) invalidates every link
// already sent.

function secret(): string {
  const value = process.env.TICKET_LINK_SECRET || process.env.JWT_SECRET;
  if (!value) throw new Error('TICKET_LINK_SECRET or JWT_SECRET must be set to issue ticket links');
  return value;
}

// A link can also be for one ticket only — the one sent to that ticket's
// own attendee in a group booking (see attendeeTickets.ts). Its signed
// part is "<reference>~<ticket id>", so it opens that ticket and nothing
// else on the booking, and a booking-wide token can't be cut down into
// one (or the reverse) without the secret.
const TICKET_SEPARATOR = '~';

function signature(payload: string): string {
  return createHmac('sha256', secret()).update(`ticket-link:${payload}`).digest('base64url').slice(0, 22);
}

export function ticketLinkToken(bookingReference: string, ticketId?: string): string {
  const payload = ticketId ? `${bookingReference}${TICKET_SEPARATOR}${ticketId}` : bookingReference;
  return `${payload}.${signature(payload)}`;
}

// What a genuine token opens: the whole booking (ticketId null) or just
// one of its tickets. Null if the token isn't genuine.
export function parseTicketLinkToken(token: string): { bookingReference: string; ticketId: string | null } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const sep = payload.indexOf(TICKET_SEPARATOR);
  if (sep < 0) return { bookingReference: payload, ticketId: null };
  const ticketId = payload.slice(sep + 1);
  return sep > 0 && ticketId ? { bookingReference: payload.slice(0, sep), ticketId } : null;
}

// The booking reference a booking-wide token is for, or null if it isn't
// genuine (or only opens one ticket).
export function verifyTicketLinkToken(token: string): string | null {
  const parsed = parseTicketLinkToken(token);
  return parsed && !parsed.ticketId ? parsed.bookingReference : null;
}

function publicBase(): string {
  return (process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
}

// Customer-facing ticket page (the web app's /t/:token route).
export function ticketPageUrl(bookingReference: string, ticketId?: string): string {
  return `${publicBase()}/t/${ticketLinkToken(bookingReference, ticketId)}`;
}

// The same booking's (or ticket's) PDF (served by the API).
export function ticketPdfUrl(bookingReference: string, ticketId?: string): string {
  return `${publicBase()}/api/t/${ticketLinkToken(bookingReference, ticketId)}/tickets.pdf`;
}

// PNG ticket card, used as the WhatsApp message's header image.
export function ticketCardUrl(bookingReference: string, ticketId?: string): string {
  return `${publicBase()}/api/t/${ticketLinkToken(bookingReference, ticketId)}/card.png`;
}

// Ticket number shown to people: INV-BKG-2026-8F3K2Q + #1 → INV-TKT-2026-8F3K2Q-01.
export function ticketDisplayReference(bookingReference: string, index: number): string {
  return `${bookingReference.replace(/-BKG-/, '-TKT-')}-${String(index + 1).padStart(2, '0')}`;
}
