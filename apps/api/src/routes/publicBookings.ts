import { Router } from 'express';
import { createBooking, SoldOutError, NotFoundError, OrganizerNotVerifiedError } from '../services/bookingCreation';
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
import { asyncHandler } from '../middleware/asyncHandler';
import { Booking, Event } from '../models';

export const publicBookingsRouter = Router();

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

publicBookingsRouter.post('/events/:eventId/bookings', asyncHandler(async (req, res) => {
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
    });

    // Online paid bookings start 'pending' — no confirmation email yet,
    // since one would misleadingly tell the customer they're booked
    // before they've actually paid. Instead, create the real Cashfree
    // order now and hand back a payment_session_id for checkout; the
    // confirmation email fires later, from the payment webhook, once
    // money has actually moved (see cashfreeOrders.ts).
    if (result.totalAmountPaise > 0 && paymentMethod === 'online') {
      const returnUrl =
        typeof (req.body as Record<string, unknown>).returnUrl === 'string'
          ? ((req.body as Record<string, unknown>).returnUrl as string)
          : `${req.protocol}://${req.get('host')}/bookings/${result.bookingId}/confirmed`;

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

publicBookingsRouter.post('/bookings/:bookingReference/feedback', asyncHandler(async (req, res) => {
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

publicBookingsRouter.post('/bookings/:bookingReference/cancel', asyncHandler(async (req, res) => {
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
