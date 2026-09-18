import { Router } from 'express';
import { createBooking, SoldOutError, NotFoundError } from '../services/bookingCreation';

export const publicBookingsRouter = Router();

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
