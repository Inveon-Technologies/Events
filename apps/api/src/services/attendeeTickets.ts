import { Booking, Ticket } from '../models';
import { enqueueNotification } from '../queue';
import { isEmailConfigured, sendEmail } from './email';
import { buildConfirmationEmail } from './bookingEmails';
import { loadBookingDocumentData } from './bookingDocuments';
import { ticketPageUrl, ticketPdfUrl } from './ticketLinks';
import { enqueueWhatsApp } from './whatsapp/messages';
import { isWhatsAppConfigured, normalizeWhatsAppNumber } from './whatsapp/client';
import { logger } from '../logger';

// Group bookings sent separately (booking.ticketDelivery = 'individual'):
// besides the buyer's usual confirmation (all tickets + invoice), each
// other attendee gets their own ticket on their own WhatsApp and email,
// through a link that opens only that ticket. A ticket whose contact is
// the buyer's own is skipped — the buyer's confirmation already covers it.

function sameNumber(a: string, b: string): boolean {
  try {
    return normalizeWhatsAppNumber(a) === normalizeWhatsAppNumber(b);
  } catch {
    return false;
  }
}

// The tickets to send on each channel.
export async function attendeeTicketRecipients(booking: Booking): Promise<{ whatsapp: Ticket[]; email: Ticket[] }> {
  if (booking.ticketDelivery !== 'individual') return { whatsapp: [], email: [] };
  const tickets = (await Ticket.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'ASC']] })).filter(
    (t) => t.status !== 'cancelled',
  );
  return {
    whatsapp: tickets.filter((t) => t.attendeeWhatsapp && !sameNumber(t.attendeeWhatsapp, booking.primaryContactWhatsapp)),
    email: tickets.filter((t) => t.attendeeEmail && t.attendeeEmail.toLowerCase() !== booking.primaryContactEmail.toLowerCase()),
  };
}

// Called next to the buyer's confirmation, wherever that is sent (free or
// cash booking created, online payment confirmed, payment reinstated).
// Fire-and-forget: never throws. One job per ticket and channel, so a
// repeated webhook can't send twice.
export async function enqueueAttendeeTickets(bookingId: string, jobSuffix = ''): Promise<void> {
  try {
    const booking = await Booking.findByPk(bookingId);
    if (!booking || booking.ticketDelivery !== 'individual') return;
    const { whatsapp, email } = await attendeeTicketRecipients(booking);
    if (isWhatsAppConfigured()) {
      for (const ticket of whatsapp) {
        // eslint-disable-next-line no-await-in-loop
        await enqueueWhatsApp('bookingConfirmation', bookingId, jobSuffix, ticket.id);
      }
    }
    if (isEmailConfigured()) {
      for (const ticket of email) {
        // eslint-disable-next-line no-await-in-loop
        await enqueueNotification(
          'attendee-ticket-email',
          { bookingId, ticketId: ticket.id },
          { jobId: `attendee-ticket-email-${ticket.id}${jobSuffix}` },
        );
      }
    }
  } catch (err) {
    logger.error({ err, bookingId }, 'Could not queue the attendees’ own tickets');
  }
}

// Job handler for "attendee-ticket-email": the designed confirmation email
// with just this attendee's ticket and no invoice. Throws on a failed send
// so the queue retries it.
export async function deliverAttendeeTicketEmail(bookingId: string, ticketId: string): Promise<void> {
  if (!isEmailConfigured()) return;
  const booking = await Booking.findByPk(bookingId);
  if (!booking || booking.status === 'cancelled') return;
  const ticket = (await attendeeTicketRecipients(booking)).email.find((t) => t.id === ticketId);
  if (!ticket?.attendeeEmail) return;
  const d = await loadBookingDocumentData(bookingId);
  if (!d) return;

  const { html, subject, attachments } = await buildConfirmationEmail(
    {
      ...d,
      customer: { ...d.customer, name: ticket.attendeeName, email: ticket.attendeeEmail },
      tickets: d.tickets.filter((t) => t.id === ticket.id),
      links: {
        ticketPage: d.links.ticketPage ? ticketPageUrl(d.bookingReference, ticket.id) : null,
        ticketPdf: d.links.ticketPdf ? ticketPdfUrl(d.bookingReference, ticket.id) : null,
      },
    },
    { bookedBy: booking.primaryContactName },
  );
  await sendEmail({ to: ticket.attendeeEmail, subject, html, attachments });
}
