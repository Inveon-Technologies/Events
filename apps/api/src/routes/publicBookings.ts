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
import { sendBookingConfirmationEmail } from '../services/bookingEmails';
import {
  customerCancelBooking,
  ValidationError as CancellationValidationError,
  NotFoundError as CancellationNotFoundError,
} from '../services/bookingCancellation';
import { getBookingDetail, getTicketQrImage, NotFoundError as TicketsNotFoundError } from '../services/customerTickets';
import {
  initiateCustomerLogin,
  verifyCustomerLoginOtp,
  getCustomerBookings,
  NotFoundError as CustomerAuthNotFoundError,
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
    // undo the reservation. sendBookingConfirmationEmail() catches
    // everything internally, so this can never produce an unhandled
    // rejection either.
    void sendBookingConfirmationEmail(result);

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

publicBookingsRouter.post('/bookings/login/initiate', customerLoginSendLimit, asyncHandler(async (req, res) => {
  const { bookingReference, email } = req.body as Record<string, unknown>;
  if (typeof bookingReference !== 'string' || typeof email !== 'string') {
    res.status(400).json({ error: 'Booking reference and email are required' });
    return;
  }

  try {
    await initiateCustomerLogin(bookingReference, email);
    // Always 200, even on a real not-found — telling the caller whether
    // the combination matched would let someone confirm a real booking
    // reference exists by guessing, the same enumeration-safety
    // reasoning used throughout this codebase's other customer-facing
    // verification endpoints, just applied one layer earlier here.
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof CustomerAuthNotFoundError) {
      res.status(200).json({ success: true });
      return;
    }
    throw err;
  }
}));

publicBookingsRouter.post('/bookings/login/verify', customerLoginVerifyLimit, asyncHandler(async (req, res) => {
  const { email, code } = req.body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof code !== 'string') {
    res.status(400).json({ error: 'Email and code are required' });
    return;
  }

  try {
    const result = await verifyCustomerLoginOtp(email, code);
    res.status(200).json(result);
  } catch (err) {
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
