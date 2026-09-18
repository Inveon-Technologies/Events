import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { getOrganizerDashboard } from '../services/organizerDashboard';
import { getOrganizerBookings, DisplayBookingStatus } from '../services/organizerBookings';
import { getOrganizerEvents, DisplayEventStatus } from '../services/organizerEvents';

export const organizerRouter = Router();

organizerRouter.use(authenticate, requireRole('organizer_owner', 'organizer_staff'));

organizerRouter.get('/dashboard', async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    // Shouldn't happen for these two roles (schema requires organizerId for
    // them), but fail clearly rather than silently querying with `undefined`.
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const dashboard = await getOrganizerDashboard(organizerId);
  res.status(200).json(dashboard);
});

const VALID_STATUSES: Array<'all' | DisplayBookingStatus> = [
  'all',
  'confirmed',
  'pending',
  'cancelled',
  'partially_cancelled',
];
const VALID_SORTS = ['newest', 'oldest', 'amount_desc', 'amount_asc'] as const;

organizerRouter.get('/bookings', async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const { eventId, status, search, sort, page, pageSize } = req.query;

  const statusParam = typeof status === 'string' && VALID_STATUSES.includes(status as never) ? (status as 'all' | DisplayBookingStatus) : 'all';
  const sortParam = typeof sort === 'string' && (VALID_SORTS as readonly string[]).includes(sort) ? (sort as (typeof VALID_SORTS)[number]) : 'newest';

  const result = await getOrganizerBookings({
    organizerId,
    eventId: typeof eventId === 'string' ? eventId : undefined,
    status: statusParam,
    search: typeof search === 'string' ? search : undefined,
    sort: sortParam,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });

  res.status(200).json(result);
});

const VALID_EVENT_STATUSES: Array<'all' | DisplayEventStatus> = ['all', 'draft', 'published', 'completed', 'cancelled'];

organizerRouter.get('/events', async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const { status } = req.query;
  const statusParam = typeof status === 'string' && VALID_EVENT_STATUSES.includes(status as never) ? (status as 'all' | DisplayEventStatus) : 'all';

  const result = await getOrganizerEvents({ organizerId, status: statusParam });
  res.status(200).json(result);
});
