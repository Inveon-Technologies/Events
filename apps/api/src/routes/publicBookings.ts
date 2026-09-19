import { Router } from 'express';
import { createBooking, SoldOutError, NotFoundError } from '../services/bookingCreation';
import { listPublicEvents, getPublicEvent } from '../services/publicEvents';

export const publicBookingsRouter = Router();

publicBookingsRouter.get('/events', async (_req, res) => {
  const events = await listPublicEvents();
  res.status(200).json({ events });
});

publicBookingsRouter.get('/events/:eventId', async (req, res) => {
  const event = await getPublicEvent(req.params.eventId);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }
  res.status(200).json(event);
});

publicBookingsRouter.post('/events/:eventId/bookings', async (req, res) => {
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
    res.status(201).json(result);
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
});
