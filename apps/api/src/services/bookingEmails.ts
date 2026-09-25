import { sendEmail, isEmailConfigured, type EmailAttachment } from './email';
import { generateTicketQrPng } from './qrCode';
import { generateInvoicePdf, invoiceNumber } from './invoice';
import { ticketConfirmationEmail } from '../emails/ticketConfirmation';
import { getBranding } from './platformSettings';
import { loadBookingDocumentData, istDateLabel, istTimeLabel, istWeekday, venueParts, type BookingDocumentData } from './bookingDocuments';
import { emailSafePng, renderEventHeaderPng } from './eventHeaderImage';
import { loadStoredImage } from './designAssets';
import type { CreateBookingResult } from './bookingCreation';
import { Booking, Event, Organizer, Ticket, TicketCategory } from '../models';
import { logger } from '../logger';

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

// Builds and sends the confirmation: the designed email (organizer's
// banner, event details, one entry ticket + QR per attendee, partners)
// with the invoice PDF attached. Everything is read back from the stored
// booking. Throws on a failed send so the job queue can retry it with
// backoff; request code never calls this directly — it enqueues the
// "booking-confirmation" job (see queue/jobs.ts), which falls back to
// running inline, errors logged, when the queue is off.
export async function deliverBookingConfirmationEmail(result: CreateBookingResult): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn({ bookingReference: result.bookingReference }, 'Email not configured — booking confirmation skipped');
    return;
  }
  const d = await loadBookingDocumentData(result.bookingId);
  if (!d) throw new Error(`Booking ${result.bookingReference} not found for its confirmation email`);

  const { html, attachments } = await buildConfirmationEmail(d);
  const invoicePdf = await generateInvoicePdf(d);

  await sendEmail({
    to: d.customer.email,
    subject: `Booking confirmed: ${d.event.name} (${d.bookingReference})`,
    html,
    attachments: [
      { filename: `Invoice-${invoiceNumber(d.bookingReference)}.pdf`, content: invoicePdf, contentType: 'application/pdf' },
      ...attachments,
    ],
  });
}

function formatInr(paise: number): string {
  return `\u20b9${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The email HTML plus the inline images it references by cid.
export async function buildConfirmationEmail(d: BookingDocumentData): Promise<{ html: string; attachments: EmailAttachment[] }> {
  const attachments: EmailAttachment[] = [];
  const inline = (cid: string, filename: string, content: Buffer, contentType = 'image/png') => {
    attachments.push({ filename, content, contentType, cid });
    return cid;
  };

  let headerCid: string | null = null;
  try {
    const png = await renderEventHeaderPng({
      backgroundUrl: d.design.backgroundUrl,
      organizerName: d.organizer.name,
      organizerLogoUrl: d.organizer.logoUrl,
      eventName: d.event.name,
      eventDate: d.event.eventDate,
      tagline: d.event.tagline,
    });
    headerCid = inline('event-header', 'event-banner.png', png);
  } catch (err) {
    logger.warn({ err, bookingReference: d.bookingReference }, 'Could not render the email banner — sending without it');
  }

  const active = d.tickets.filter((t) => t.status !== 'cancelled');
  const tickets = [];
  for (const [i, t] of active.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const qr = await generateTicketQrPng(t.qrToken);
    tickets.push({
      attendeeName: t.attendeeName,
      tierName: t.tierName,
      ticketId: t.displayReference,
      statusText: d.bookingStatus === 'confirmed' ? 'CONFIRMED' : d.bookingStatus.toUpperCase(),
      qrCid: inline(`ticket-qr-${i + 1}`, `Ticket-${i + 1}-QR.png`, qr),
    });
  }

  const partners = [];
  for (const [i, p] of d.design.partners.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const logo = await emailSafePng(await loadStoredImage(p.logoUrl, 4 * 1024 * 1024));
    partners.push({ name: p.name, role: p.role, logoCid: logo ? inline(`partner-${i + 1}`, `partner-${i + 1}.png`, logo) : null });
  }
  const orgLogo = await emailSafePng(await loadStoredImage(d.organizer.logoUrl, 4 * 1024 * 1024), 160, 160);

  const { venue, city } = venueParts(d.event.venueAddress);
  const free = d.totalPaise === 0;
  const cashDue = !free && d.payment.method === 'cash' && d.payment.status !== 'paid';
  const generated = active.length > 1 ? 'your entry tickets have been generated' : 'your entry ticket has been generated';
  const statusLine = free
    ? `your free registration is confirmed and ${generated}`
    : cashDue
      ? `your booking is confirmed and ${generated} — please pay at the venue`
      : `your payment has been successfully verified and ${generated}`;

  const html = ticketConfirmationEmail({
    headerCid,
    eventName: d.event.name,
    customerName: d.customer.name,
    bookingReference: d.bookingReference,
    statusLine,
    dateLabel: istDateLabel(d.event.eventDate),
    weekday: istWeekday(d.event.eventDate),
    reportingTime: d.event.gateOpenTime ? istTimeLabel(d.event.gateOpenTime) : null,
    eventTime: istTimeLabel(d.event.eventDate),
    venue,
    city,
    organizerName: d.organizer.name,
    organizerPhone: d.organizer.contactPhone,
    organizerLogoCid: orgLogo ? inline('organizer-logo', 'organizer-logo.png', orgLogo) : null,
    inviteNote: `We look forward to welcoming you${city ? ` in ${city}` : ''}. Please carry your ticket QR on your phone.`,
    tickets,
    ticketPageUrl: d.links.ticketPage,
    ticketPdfUrl: d.links.ticketPdf,
    partners,
    amountLine: free ? null : cashDue ? `Amount due at the venue: ${formatInr(d.totalPaise)}` : `Amount paid: ${formatInr(d.totalPaise)} · Invoice attached`,
    supportEmail: getBranding().supportEmail,
  });
  return { html, attachments };
}

// Best-effort variant, never throws — for callers that just want the
// email out and have no retry of their own.
export async function sendBookingConfirmationEmail(result: CreateBookingResult): Promise<void> {
  try {
    await deliverBookingConfirmationEmail(result);
  } catch (err) {
    logger.error({ err, bookingReference: result.bookingReference }, 'Failed to send booking confirmation email');
  }
}
