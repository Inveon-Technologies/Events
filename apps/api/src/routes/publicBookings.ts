import { Router, Request } from 'express';
import {
  createBooking,
  SoldOutError,
  GenderRestrictionError,
  NotFoundError,
  OrganizerNotVerifiedError,
  BookingValidationError,
} from '../services/bookingCreation';
import { createCashfreeOrderForBooking, NotFoundError as OrderNotFoundError } from '../services/cashfreeOrders';
import { CashfreeNotConfiguredError } from '../services/cashfreeClient';
import { listPublicEvents, getPublicEvent } from '../services/publicEvents';
import { listPublicOrganizers, getPublicOrganizer } from '../services/publicOrganizers';
import {
  submitReview,
  getEventReviews,
  NotFoundError as ReviewNotFoundError,
  ValidationError as ReviewValidationError,
} from '../services/eventReviews';
import { enqueueNotification } from '../queue';
import { enqueueWhatsApp } from '../services/whatsapp/messages';
import {
  customerCancelBooking,
  ValidationError as CancellationValidationError,
  NotFoundError as CancellationNotFoundError,
} from '../services/bookingCancellation';
import {
  findBookingByToken,
  getBookingDetail,
  getBookingDetailByToken,
  getTicketQrImage,
  getTicketQrImageByToken,
  NotFoundError as TicketsNotFoundError,
} from '../services/customerTickets';
import { loadTicketArtworkData, renderTicketCardPng, renderTicketPdf } from '../services/ticketArtwork';
import {
  initiateCustomerLogin,
  verifyCustomerLoginOtp,
  getCustomerBookings,
  NotFoundError as CustomerAuthNotFoundError,
  ContactMismatchError,
  LoginValidationError,
  OtpCooldownError,
  OtpDeliveryError,
  InvalidOtpError,
} from '../services/customerAuth';
import { verifyCustomerSessionToken } from '../auth/jwt';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { Booking, Event } from '../models';

export const publicBookingsRouter = Router();

const FIFTEEN_MINUTES = 15 * 60;
// Booking creation reserves real stock and (for free/cash bookings)
// sends email to whatever address was entered.
const bookingCreateLimit = rateLimit({ name: 'booking-create', windowSeconds: FIFTEEN_MINUTES, max: 20 });
// Reference + email lookups — the booking reference is the only secret
// here, so guessing has to be slow. Generous enough for one customer's
// ticket page (detail + one QR image per ticket, reloaded a few times).
const bookingLookupLimit = rateLimit({ name: 'booking-lookup', windowSeconds: FIFTEEN_MINUTES, max: 120 });
const bookingActionLimit = rateLimit({ name: 'booking-action', windowSeconds: FIFTEEN_MINUTES, max: 10 });
const customerLoginSendLimit = rateLimit({ name: 'customer-login-send', windowSeconds: FIFTEEN_MINUTES, max: 5 });
const customerLoginVerifyLimit = rateLimit({ name: 'customer-login-verify', windowSeconds: FIFTEEN_MINUTES, max: 20 });

// Cashfree sends the customer's browser to whatever return_url we give
// it, so a client-supplied value is only honored when it points back at
// this site (same origin as the request, or WEB_PUBLIC_URL when the
// frontend lives elsewhere) — never an arbitrary external page. With
// `trust proxy` set in app.ts, req.protocol reflects the real https
// scheme behind the TLS-terminating front-door nginx.
function resolveReturnUrl(req: Request, requested: unknown, bookingId: string): string {
  const ownOrigin = `${req.protocol}://${req.get('host')}`;
  const allowedOrigins = new Set([ownOrigin]);
  if (process.env.WEB_PUBLIC_URL) {
    try {
      allowedOrigins.add(new URL(process.env.WEB_PUBLIC_URL).origin);
    } catch {
      // Misconfigured WEB_PUBLIC_URL — just don't allow it.
    }
  }

  if (typeof requested === 'string') {
    try {
      const url = new URL(requested, ownOrigin);
      if (allowedOrigins.has(url.origin)) return url.toString();
    } catch {
      // Unparseable — fall through to the default.
    }
  }
  return `${ownOrigin}/bookings/${bookingId}/confirmed`;
}

// Intentionally minimal, no auth — this exists for exactly one purpose:
// Cashfree redirects the customer's own browser back here right after
// they just paid (see cashfreeOrders.ts's returnUrl), and that page
// needs to know whether the payment actually went through yet (the
// webhook that confirms it can arrive slightly before or after this
// redirect). A booking id is a UUID, not meaningfully guessable, but
// this still returns only what that specific "did it work" check
// needs — never the customer's name, email, or phone, which a public,
// unauthenticated endpoint has no business exposing just because
// someone has (or guesses) a booking id.
publicBookingsRouter.get('/bookings/:bookingId/status', asyncHandler(async (req, res) => {
  const booking = await Booking.findByPk(req.params.bookingId);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found' });
    return;
  }
  const event = await Event.findByPk(booking.eventId);

  res.status(200).json({
    status: booking.status,
    bookingReference: booking.bookingReference,
    eventName: event?.name ?? null,
  });
}));

publicBookingsRouter.get('/organizers', asyncHandler(async (_req, res) => {
  const organizers = await listPublicOrganizers();
  res.status(200).json({ organizers });
}));

publicBookingsRouter.get('/organizers/:slug', asyncHandler(async (req, res) => {
  const organizer = await getPublicOrganizer(req.params.slug);
  if (!organizer) {
    res.status(404).json({ error: 'Organizer not found' });
    return;
  }
  res.status(200).json(organizer);
}));

publicBookingsRouter.get('/events', asyncHandler(async (_req, res) => {
  const events = await listPublicEvents();
  res.status(200).json({ events });
}));

publicBookingsRouter.get('/events/:eventId', asyncHandler(async (req, res) => {
  const event = await getPublicEvent(req.params.eventId);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }
  res.status(200).json(event);
}));

publicBookingsRouter.post('/events/:eventId/bookings', bookingCreateLimit, asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const {
    ticketCategoryId,
    quantity,
    primaryContactName,
    primaryContactWhatsapp,
    primaryContactEmail,
    primaryContactCity,
    paymentMethod,
    attendeeNames,
    attendeeGenders,
  } = req.body as Record<string, unknown>;

  if (
    typeof ticketCategoryId !== 'string' ||
    typeof quantity !== 'number' ||
    typeof primaryContactName !== 'string' ||
    typeof primaryContactWhatsapp !== 'string' ||
    typeof primaryContactEmail !== 'string' ||
    (paymentMethod !== 'online' && paymentMethod !== 'cash')
  ) {
    res.status(400).json({ error: 'Missing or invalid booking fields' });
    return;
  }

  try {
    const result = await createBooking({
      eventId,
      ticketCategoryId,
      quantity,
      primaryContactName,
      primaryContactWhatsapp,
      primaryContactEmail,
      primaryContactCity: typeof primaryContactCity === 'string' ? primaryContactCity : undefined,
      paymentMethod,
      attendeeNames: Array.isArray(attendeeNames) ? attendeeNames.filter((n): n is string => typeof n === 'string') : undefined,
      attendeeGenders: Array.isArray(attendeeGenders) ? attendeeGenders.filter((g): g is string => typeof g === 'string') : undefined,
    });

    // Online paid bookings start 'pending' — no confirmation email yet,
    // since one would misleadingly tell the customer they're booked
    // before they've actually paid. Instead, create the real Cashfree
    // order now and hand back a payment_session_id for checkout; the
    // confirmation email fires later, from the payment webhook, once
    // money has actually moved (see cashfreeOrders.ts).
    if (result.totalAmountPaise > 0 && paymentMethod === 'online') {
      const returnUrl = resolveReturnUrl(req, (req.body as Record<string, unknown>).returnUrl, result.bookingId);

      const order = await createCashfreeOrderForBooking({
        bookingId: result.bookingId,
        bookingReference: result.bookingReference,
        totalAmountPaise: result.totalAmountPaise,
        organizerId: result.organizerId,
        customerName: primaryContactName,
        customerEmail: primaryContactEmail,
        customerPhone: primaryContactWhatsapp,
        returnUrl,
      });

      res.status(201).json({
        bookingId: result.bookingId,
        bookingReference: result.bookingReference,
        paymentSessionId: order.paymentSessionId,
      });
      return;
    }

    // Fire-and-forget: the booking is already committed at this point, and
    // a slow or failed email send must never delay the HTTP response or
    // undo the reservation. enqueueNotification() never throws (it runs
    // the job inline, errors logged, if the queue is down), so this can
    // never produce an unhandled rejection either.
    void enqueueNotification(
      'booking-confirmation',
      { bookingId: result.bookingId },
      { jobId: `booking-confirmation-${result.bookingId}` },
    );
    void enqueueWhatsApp('bookingConfirmation', result.bookingId);

    res.status(201).json({ bookingId: result.bookingId, bookingReference: result.bookingReference });
  } catch (err) {
    if (err instanceof SoldOutError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof GenderRestrictionError || err instanceof BookingValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof NotFoundError || err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof OrganizerNotVerifiedError) {
      res.status(422).json({ error: err.message });
      return;
    }
    if (err instanceof CashfreeNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

publicBookingsRouter.get('/events/:eventId/reviews', asyncHandler(async (req, res) => {
  // Accepts the event's real database id here specifically (not slug)
  // — this route is only ever called from EventDetailsPage.tsx with the
  // id already resolved from the event detail response it just fetched,
  // same pattern as organizer-side event-scoped routes.
  const reviews = await getEventReviews(req.params.eventId);
  res.status(200).json({ reviews });
}));

publicBookingsRouter.post('/bookings/:bookingReference/feedback', bookingActionLimit, asyncHandler(async (req, res) => {
  const { email, rating, reviewText } = req.body as Record<string, unknown>;

  if (typeof email !== 'string' || typeof rating !== 'number') {
    res.status(400).json({ error: 'Email and rating are required' });
    return;
  }

  try {
    const result = await submitReview({
      bookingReference: req.params.bookingReference,
      email,
      rating,
      reviewText: typeof reviewText === 'string' ? reviewText : undefined,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ReviewNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ReviewValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

publicBookingsRouter.post('/bookings/:bookingReference/cancel', bookingActionLimit, asyncHandler(async (req, res) => {
  const { email, reason } = req.body as Record<string, unknown>;

  if (typeof email !== 'string' || typeof reason !== 'string') {
    res.status(400).json({ error: 'Email and a cancellation reason are required' });
    return;
  }

  try {
    const result = await customerCancelBooking(req.params.bookingReference, email, reason);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof CancellationNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CancellationValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

publicBookingsRouter.get('/bookings/:bookingReference/tickets', bookingLookupLimit, asyncHandler(async (req, res) => {
  const { email } = req.query;
  if (typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  try {
    const detail = await getBookingDetail(req.params.bookingReference, email);
    res.status(200).json(detail);
  } catch (err) {
    if (err instanceof TicketsNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

publicBookingsRouter.get('/bookings/:bookingReference/tickets/:ticketId/qr', bookingLookupLimit, asyncHandler(async (req, res) => {
  const { email } = req.query;
  if (typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  try {
    const png = await getTicketQrImage(req.params.bookingReference, email, req.params.ticketId);
    res.status(200).set('Content-Type', 'image/png').send(png);
  } catch (err) {
    if (err instanceof TicketsNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

// ---- Ticket page behind a signed link (/t/:token, see ticketLinks.ts) ----
// The token is the proof of access. Responses are private: they carry
// entry QR codes.

async function withTicketToken(res: Parameters<Parameters<typeof asyncHandler>[0]>[1], work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (err instanceof TicketsNotFoundError) {
      res.status(404).json({ error: 'Ticket not found. Check the link, or find your booking with its reference and email.' });
      return;
    }
    throw err;
  }
}

publicBookingsRouter.get('/t/:token', bookingLookupLimit, asyncHandler(async (req, res) => {
  await withTicketToken(res, async () => {
    const detail = await getBookingDetailByToken(req.params.token);
    res.set('Cache-Control', 'private, no-store').status(200).json(detail);
  });
}));

publicBookingsRouter.get('/t/:token/tickets/:ticketId/qr', bookingLookupLimit, asyncHandler(async (req, res) => {
  await withTicketToken(res, async () => {
    const png = await getTicketQrImageByToken(req.params.token, req.params.ticketId);
    res.set('Cache-Control', 'private, max-age=300').type('image/png').send(png);
  });
}));

publicBookingsRouter.get('/t/:token/tickets.pdf', bookingLookupLimit, asyncHandler(async (req, res) => {
  await withTicketToken(res, async () => {
    const booking = await findBookingByToken(req.params.token);
    const pdf = await renderTicketPdf(await loadTicketArtworkData(booking));
    res
      .set('Cache-Control', 'private, no-store')
      .set('Content-Disposition', `inline; filename="Tickets-${booking.bookingReference}.pdf"`)
      .type('application/pdf')
      .send(pdf);
  });
}));

// Same PDF at a URL that ends in the token: a WhatsApp URL button's
// variable part has to be the end of its URL.
publicBookingsRouter.get('/ticket-pdf/:token', bookingLookupLimit, asyncHandler(async (req, res) => {
  res.redirect(302, `/api/t/${encodeURIComponent(req.params.token)}/tickets.pdf`);
}));

// The WhatsApp confirmation's header image, fetched by WhatsApp's servers
// when a message is sent. Not rate-limited per IP: those fetches all come
// from a few provider IPs, and a limit would strip images off messages on
// a busy day. The signed token already stops guessing; a short cache keeps
// a repeated fetch from re-rendering.
const CARD_CACHE_TTL_MS = 10 * 60 * 1000;
const cardCache = new Map<string, { png: Buffer; expires: number }>();

publicBookingsRouter.get('/t/:token/card.png', asyncHandler(async (req, res) => {
  await withTicketToken(res, async () => {
    const booking = await findBookingByToken(req.params.token);
    const key = `${booking.id}:${booking.status}:${booking.updatedAt.getTime()}`;
    const now = Date.now();
    let cached = cardCache.get(key);
    if (!cached || cached.expires < now) {
      cached = { png: await renderTicketCardPng(await loadTicketArtworkData(booking)), expires: now + CARD_CACHE_TTL_MS };
      if (cardCache.size >= 200) {
        for (const [k, v] of cardCache) if (v.expires < now || cardCache.size >= 200) cardCache.delete(k);
      }
      cardCache.set(key, cached);
    }
    res.set('Cache-Control', 'private, max-age=300').type('image/png').send(cached.png);
  });
}));

publicBookingsRouter.post('/bookings/login/initiate', customerLoginSendLimit, asyncHandler(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  // `contact` is the "email or mobile" field; `email` is what older
  // clients send.
  const contact = typeof body.contact === 'string' ? body.contact : body.email;
  if (typeof body.bookingReference !== 'string' || typeof contact !== 'string') {
    res.status(400).json({ error: 'Booking ID and email or mobile number are required' });
    return;
  }

  try {
    const result = await initiateCustomerLogin(body.bookingReference, contact);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err instanceof LoginValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof CustomerAuthNotFoundError) {
      res.status(404).json({ error: err.message, code: 'BOOKING_NOT_FOUND' });
      return;
    }
    if (err instanceof ContactMismatchError) {
      res.status(404).json({ error: err.message, code: 'CONTACT_MISMATCH' });
      return;
    }
    if (err instanceof OtpCooldownError) {
      res.status(429).set('Retry-After', String(err.retryAfterSeconds)).json({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
      return;
    }
    if (err instanceof OtpDeliveryError) {
      res.status(503).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

publicBookingsRouter.post('/bookings/login/verify', customerLoginVerifyLimit, asyncHandler(async (req, res) => {
  const { bookingReference, email, code } = req.body as Record<string, unknown>;
  if (typeof code !== 'string' || (typeof bookingReference !== 'string' && typeof email !== 'string')) {
    res.status(400).json({ error: 'Booking ID and the 6-digit code are required' });
    return;
  }

  try {
    const result = await verifyCustomerLoginOtp(
      { bookingReference: typeof bookingReference === 'string' ? bookingReference : undefined, email: typeof email === 'string' ? email : undefined },
      code,
    );
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof LoginValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidOtpError) {
      res.status(401).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

publicBookingsRouter.get('/bookings/my', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const { email } = verifyCustomerSessionToken(authHeader.slice('Bearer '.length));
    const bookings = await getCustomerBookings(email);
    res.status(200).json({ bookings });
  } catch {
    res.status(401).json({ error: 'Your session has expired — please log in again' });
  }
}));
