import { Op } from 'sequelize';
import { Organizer, Event, Ticket, Booking, Payment } from '../models';

export type DisplayEventStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export interface OrganizerEventRow {
  id: string;
  eventCode: string;
  name: string;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  capacity: number;
  ticketsSold: number;
  revenuePaise: number;
  displayStatus: DisplayEventStatus;
}

export interface OrganizerEventsResult {
  organizerName: string;
  counts: Record<'all' | DisplayEventStatus, number>;
  events: OrganizerEventRow[];
}

export interface OrganizerEventsParams {
  organizerId: string;
  status?: 'all' | DisplayEventStatus;
}

// draft/cancelled are stored as-is. 'completed' is never stored — it's a
// published event whose date has passed. Mirrors the bookings service's
// partially_cancelled derivation for the same reason: this can never drift
// out of sync with reality the way a manually-set status could.
function deriveEventStatus(status: string, eventDate: Date, now: Date): DisplayEventStatus {
  if (status === 'draft') return 'draft';
  if (status === 'cancelled') return 'cancelled';
  // status === 'published' or legacy 'closed'
  return eventDate < now ? 'completed' : 'published';
}

export async function getOrganizerEvents(params: OrganizerEventsParams): Promise<OrganizerEventsResult> {
  const { organizerId } = params;
  const now = new Date();

  const [organizer, events] = await Promise.all([
    Organizer.findByPk(organizerId),
    Event.findAll({ where: { organizerId }, order: [['eventDate', 'DESC']] }),
  ]);

  const rows: OrganizerEventRow[] = await Promise.all(
    events.map(async (event) => {
      const [ticketsSold, revenueRow] = await Promise.all([
        Ticket.count({
          include: [{ model: Booking, attributes: [], where: { eventId: event.id } }],
          where: { status: { [Op.ne]: 'cancelled' } },
        }),
        Payment.findOne({
          attributes: [[Payment.sequelize!.fn('COALESCE', Payment.sequelize!.fn('SUM', Payment.sequelize!.col('Payment.amount_paise')), 0), 'total']],
          include: [{ model: Booking, attributes: [], where: { eventId: event.id } }],
          where: { status: 'paid' },
          raw: true,
        }),
      ]);

      return {
        id: event.id,
        eventCode: `EVT-${event.id.slice(0, 6).toUpperCase()}`,
        name: event.name,
        eventDate: event.eventDate.toISOString(),
        venueAddress: event.venueAddress,
        bannerUrl: event.bannerUrl,
        capacity: event.capacity,
        ticketsSold,
        revenuePaise: Number((revenueRow as unknown as { total: string } | null)?.total ?? 0),
        displayStatus: deriveEventStatus(event.status, event.eventDate, now),
      };
    }),
  );

  const counts: Record<'all' | DisplayEventStatus, number> = {
    all: rows.length,
    draft: 0,
    published: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const r of rows) counts[r.displayStatus] += 1;

  const filtered = params.status && params.status !== 'all' ? rows.filter((r) => r.displayStatus === params.status) : rows;

  return {
    organizerName: organizer?.name ?? 'Organizer',
    counts,
    events: filtered,
  };
}
