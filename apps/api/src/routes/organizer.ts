import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOrganizerDashboard } from '../services/organizerDashboard';
import { getOrganizerBookings, DisplayBookingStatus } from '../services/organizerBookings';
import { getOrganizerEvents, DisplayEventStatus } from '../services/organizerEvents';
import { createOrganizerEvent, ValidationError, CreateEventTicketTier } from '../services/eventCreation';

export const organizerRouter = Router();

organizerRouter.use(authenticate, requireRole('organizer_owner', 'organizer_staff'));

organizerRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    // Shouldn't happen for these two roles (schema requires organizerId for
    // them), but fail clearly rather than silently querying with `undefined`.
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const dashboard = await getOrganizerDashboard(organizerId);
  res.status(200).json(dashboard);
}));

const VALID_STATUSES: Array<'all' | DisplayBookingStatus> = [
  'all',
  'confirmed',
  'pending',
  'cancelled',
  'partially_cancelled',
];
const VALID_SORTS = ['newest', 'oldest', 'amount_desc', 'amount_asc'] as const;

organizerRouter.get('/bookings', asyncHandler(async (req, res) => {
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
}));

const VALID_EVENT_STATUSES: Array<'all' | DisplayEventStatus> = ['all', 'draft', 'published', 'completed', 'cancelled'];

organizerRouter.get('/events', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const { status } = req.query;
  const statusParam = typeof status === 'string' && VALID_EVENT_STATUSES.includes(status as never) ? (status as 'all' | DisplayEventStatus) : 'all';

  const result = await getOrganizerEvents({ organizerId, status: statusParam });
  res.status(200).json(result);
}));

organizerRouter.post('/events', asyncHandler(async (req, res) => {
  const organizerId = req.user?.organizerId;
  if (!organizerId) {
    res.status(400).json({ error: 'This account has no associated organizer' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const status = body.status === 'draft' ? 'draft' : 'published';

  const rawTiers = Array.isArray(body.ticketTiers) ? body.ticketTiers : [];
  const ticketTiers: CreateEventTicketTier[] = rawTiers.map((t) => {
    const tier = t as Record<string, unknown>;
    return {
      name: typeof tier.name === 'string' ? tier.name : '',
      description: typeof tier.description === 'string' ? tier.description : undefined,
      price: typeof tier.price === 'number' ? tier.price : Number(tier.price) || 0,
      quantity: typeof tier.quantity === 'number' ? tier.quantity : Number(tier.quantity) || 0,
    };
  });

  try {
    const created = await createOrganizerEvent({
      organizerId,
      title: typeof body.title === 'string' ? body.title : '',
      shortDescription: typeof body.shortDescription === 'string' ? body.shortDescription : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      startDate: typeof body.startDate === 'string' ? body.startDate : '',
      startTime: typeof body.startTime === 'string' ? body.startTime : '',
      venueName: typeof body.venueName === 'string' ? body.venueName : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      pincode: typeof body.pincode === 'string' ? body.pincode : undefined,
      bannerImage: typeof body.bannerImage === 'string' ? body.bannerImage : undefined,
      cancellationPolicyDescription:
        typeof body.cancellationPolicy === 'object' && body.cancellationPolicy !== null
          ? String((body.cancellationPolicy as Record<string, unknown>).description ?? '')
          : undefined,
      ticketTiers,
      status,
    });
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));
