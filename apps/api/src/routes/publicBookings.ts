import { Router } from 'express';
import { createBooking, SoldOutError, NotFoundError } from '../services/bookingCreation';
import { listPublicEvents, getPublicEvent } from '../services/publicEvents';
import { listPublicOrganizers, getPublicOrganizer } from '../services/publicOrganizers';
import {
  submitReview,
  getEventReviews,
  NotFoundError as ReviewNotFoundError,
  ValidationError as ReviewValidationError,
} from '../services/eventReviews';
import { sendBookingConfirmationEmail } from '../services/bookingEmails';
import { asyncHandler } from '../middleware/asyncHandler';

export const publicBookingsRouter = Router();

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
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
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
