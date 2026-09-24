import { Op } from 'sequelize';
import { Organizer, Event, Ticket, Booking, Payment } from '../models';
import { getEventCoverUrls } from './eventMedia';

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
  checkedInCount: number;
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
export function deriveEventStatus(status: string, eventDate: Date, now: Date): DisplayEventStatus {
  if (status === 'draft') return 'draft';
  if (status === 'cancelled') return 'cancelled';
  // status === 'published' or legacy 'closed'
  return eventDate < now ? 'completed' : 'published';
}

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

export interface EventFinancials {
  eventName: string;
  ticketsSold: number;
  grossRevenuePaise: number;
  platformFeePercent: number;
  platformFeePaise: number;
  netPayoutPaise: number;
  bankAccountHolderName: string | null;
  bankAccountNumberLast4: string | null;
  bankIfsc: string | null;
  payoutActive: boolean;
}

// The real per-event financial breakdown — gross revenue from actually
// paid bookings, the fee this deployment is actually configured to
// take (PLATFORM_FEE_PERCENT, the same variable cashfreeOrders.ts uses
// to build the real vendor split — never a hardcoded percentage that
// could silently drift from what's actually charged), and the
// organizer's own real linked bank details from their completed
// verification, not a placeholder account.
export async function getEventFinancials(eventId: string, organizerId: string): Promise<EventFinancials> {
  const event = await Event.findByPk(eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== organizerId) throw new ForbiddenError('You do not have access to this event');

  const organizer = await Organizer.findByPk(organizerId);

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

  const grossRevenuePaise = Number((revenueRow as unknown as { total: string } | null)?.total ?? 0);
  // Same source of truth as the real Cashfree split calculation
  // (cashfreeOrders.ts) — this page must never show a fee percentage
  // that differs from what actually gets deducted.
  const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT) || 0;
  const platformFeePaise = Math.round(grossRevenuePaise * (platformFeePercent / 100));

  return {
    eventName: event.name,
    ticketsSold,
    grossRevenuePaise,
    platformFeePercent,
    platformFeePaise,
    netPayoutPaise: grossRevenuePaise - platformFeePaise,
    bankAccountHolderName: organizer?.bankAccountHolderName ?? null,
    bankAccountNumberLast4: organizer?.bankAccountNumberLast4 ?? null,
    bankIfsc: organizer?.bankIfsc ?? null,
    payoutActive: organizer?.cashfreeVendorStatus === 'active',
  };
}

export async function getOrganizerEvents(params: OrganizerEventsParams): Promise<OrganizerEventsResult> {
  const { organizerId } = params;
  const now = new Date();

  const [organizer, events] = await Promise.all([
    Organizer.findByPk(organizerId),
    Event.findAll({ where: { organizerId }, order: [['eventDate', 'DESC']] }),
  ]);

  // Before, this returned event.bannerUrl only — which the create flow
  // never sets (photos are uploaded as event media) — so every event
  // card in the organizer portal showed a stock placeholder instead of
  // the organizer's own cover photo. Same rule as the public site now.
  const coverUrls = await getEventCoverUrls(events);

  const rows: OrganizerEventRow[] = await Promise.all(
    events.map(async (event) => {
      const [ticketsSold, checkedInCount, revenueRow] = await Promise.all([
        Ticket.count({
          include: [{ model: Booking, attributes: [], where: { eventId: event.id } }],
          where: { status: { [Op.ne]: 'cancelled' } },
        }),
        Ticket.count({
          include: [{ model: Booking, attributes: [], where: { eventId: event.id } }],
          where: { status: 'checked_in' },
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
        bannerUrl: coverUrls.get(event.id) ?? null,
        capacity: event.capacity,
        ticketsSold,
        checkedInCount,
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
