import { sendEmail, isEmailConfigured } from './email';
import { generateTicketQrPng } from './qrCode';
import { generateInvoicePdf } from './invoice';
import { bookingConfirmationEmail } from '../emails/templates';
import type { CreateBookingResult } from './bookingCreation';
import { Booking, Event, Organizer, Ticket, TicketCategory } from '../models';

// Re-derives the same shape createBooking() returns directly, for the
// one case that doesn't have it in hand already: the Cashfree webhook
// arrives as a separate, later HTTP request (payment confirmation is
// asynchronous), with no way to carry the original in-memory result
// across that gap — so it re-queries what it needs instead. All tickets
// in a booking currently share one ticket category (the booking model
// doesn't yet support mixed-tier bookings), so reading category/pricing
// off the first ticket found is safe, not an arbitrary choice among
// several.
export async function buildBookingEmailPayload(bookingId: string): Promise<CreateBookingResult | null> {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) return null;

  const event = await Event.findByPk(booking.eventId);
  if (!event) return null;

  const organizer = await Organizer.findByPk(event.organizerId);

  const tickets = await Ticket.findAll({ where: { bookingId: booking.id } });
  if (tickets.length === 0) return null;

  const ticketCategory = await TicketCategory.findByPk(tickets[0].ticketCategoryId);
  if (!ticketCategory) return null;

  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference,
    paymentId: '', // Not needed for sending the email itself.
    totalAmountPaise: booking.totalAmountPaise,
    organizerId: event.organizerId,
    email: {
      eventName: event.name,
      eventDate: event.eventDate,
      venueAddress: event.venueAddress,
      organizerName: organizer?.name ?? 'Event Organizer',
      customerName: booking.primaryContactName,
      customerEmail: booking.primaryContactEmail,
      tierName: ticketCategory.name,
      unitPricePaise: ticketCategory.pricePaise,
      quantity: tickets.length,
      totalAmountPaise: booking.totalAmountPaise,
      ticketQrTokens: tickets.map((tk) => tk.qrToken),
    },
  };
}

// Best-effort, deliberately never throws — a failed or unconfigured email
// send must never undo or block a booking that's already been committed
// to the database. Callers fire this after createBooking() resolves and
// don't await it on the response path.
export async function sendBookingConfirmationEmail(result: CreateBookingResult): Promise<void> {
  const { email } = result;

  if (!isEmailConfigured()) {
    // eslint-disable-next-line no-console
    console.warn(`Email not configured — skipping booking confirmation for ${result.bookingReference}`);
    return;
  }

  try {
    const qrBuffers = await Promise.all(email.ticketQrTokens.map((token) => generateTicketQrPng(token)));

    const invoicePdf = await generateInvoicePdf({
      bookingReference: result.bookingReference,
      eventName: email.eventName,
      eventDate: email.eventDate,
      venueAddress: email.venueAddress,
      organizerName: email.organizerName,
      customerName: email.customerName,
      customerEmail: email.customerEmail,
      lineItems: [{ description: email.tierName, quantity: email.quantity, unitPricePaise: email.unitPricePaise }],
      totalPaise: email.totalAmountPaise,
      createdAt: new Date(),
    });

    const html = bookingConfirmationEmail({
      customerName: email.customerName,
      eventName: email.eventName,
      eventDateLabel: email.eventDate.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
      venueAddress: email.venueAddress,
      organizerName: email.organizerName,
      bookingReference: result.bookingReference,
      lineItems: [{ tierName: email.tierName, quantity: email.quantity, unitPricePaise: email.unitPricePaise }],
      totalPaise: email.totalAmountPaise,
      ticketCount: email.quantity,
    });

    await sendEmail({
      to: email.customerEmail,
      subject: `Booking confirmed: ${email.eventName} (${result.bookingReference})`,
      html,
      attachments: [
        { filename: `Invoice-${result.bookingReference}.pdf`, content: invoicePdf, contentType: 'application/pdf' },
        ...qrBuffers.map((buf, i) => ({
          filename: `Ticket-${i + 1}-QR.png`,
          content: buf,
          contentType: 'image/png',
        })),
      ],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to send booking confirmation email for ${result.bookingReference}:`, err);
  }
}
