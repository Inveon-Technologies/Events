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

function signature(bookingReference: string): string {
  return createHmac('sha256', secret()).update(`ticket-link:${bookingReference}`).digest('base64url').slice(0, 22);
}

export function ticketLinkToken(bookingReference: string): string {
  return `${bookingReference}.${signature(bookingReference)}`;
}

// The booking reference the token is for, or null if it isn't genuine.
export function verifyTicketLinkToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const reference = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(reference));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return reference;
}

function publicBase(): string {
  return (process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
}

// Customer-facing ticket page (the web app's /t/:token route).
export function ticketPageUrl(bookingReference: string): string {
  return `${publicBase()}/t/${ticketLinkToken(bookingReference)}`;
}

// The same booking's ticket PDF (served by the API).
export function ticketPdfUrl(bookingReference: string): string {
  return `${publicBase()}/api/t/${ticketLinkToken(bookingReference)}/tickets.pdf`;
}

// PNG ticket card, used as the WhatsApp message's header image.
export function ticketCardUrl(bookingReference: string): string {
  return `${publicBase()}/api/t/${ticketLinkToken(bookingReference)}/card.png`;
}
