import { Op, WhereOptions } from 'sequelize';
import { Organizer, Event, Booking, Ticket, Payment } from '../models';

export type DisplayBookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'partially_cancelled';

export interface OrganizerBookingRow {
  id: string;
  bookingReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  eventId: string;
  eventName: string;
  ticketCount: number;
  totalAmountPaise: number;
  paymentStatus: string | null;
  displayStatus: DisplayBookingStatus;
  createdAt: string;
}

export interface OrganizerBookingsResult {
  organizerName: string;
  event: { id: string; name: string; eventDate: string; status: string } | null;
  organizerEvents: { id: string; name: string }[];
  counts: Record<'all' | DisplayBookingStatus, number>;
  bookings: OrganizerBookingRow[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface OrganizerBookingsParams {
  organizerId: string;
  eventId?: string;
  status?: 'all' | DisplayBookingStatus;
  search?: string;
  sort?: 'newest' | 'oldest' | 'amount_desc' | 'amount_asc';
  page?: number;
  pageSize?: number;
}

// A booking's stored status covers pending/confirmed/cancelled — whether
// it's "partially cancelled" is derived from its tickets, not stored, so
// it can never drift out of sync with the tickets themselves.
function deriveStatus(bookingStatus: string, tickets: Ticket[]): DisplayBookingStatus {
  if (bookingStatus === 'cancelled') return 'cancelled';
  if (bookingStatus === 'pending') return 'pending';
  const cancelledCount = tickets.filter((t) => t.status === 'cancelled').length;
  if (cancelledCount > 0 && cancelledCount < tickets.length) return 'partially_cancelled';
  return 'confirmed';
}

export async function getOrganizerBookings(params: OrganizerBookingsParams): Promise<OrganizerBookingsResult> {
  const { organizerId } = params;
  const page = params.page && params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 10;

  const organizer = await Organizer.findByPk(organizerId);
  const organizerEvents = await Event.findAll({
    where: { organizerId },
    order: [['eventDate', 'DESC']],
    attributes: ['id', 'name'],
  });

  // eventId === 'all' (or omitted with no events at all) means "every
  // event this organizer owns" — used by the dashboard and the global
  // Bookings operations page, as opposed to the per-event bookings tab
  // reached from a specific event's own workspace.
  const wantsAllEvents = params.eventId === 'all';
  const eventId = wantsAllEvents ? undefined : (params.eventId ?? organizerEvents[0]?.id);
  const singleEvent = !wantsAllEvents && eventId ? await Event.findOne({ where: { id: eventId, organizerId } }) : null;

  if (!wantsAllEvents && !singleEvent) {
    return {
      organizerName: organizer?.name ?? 'Organizer',
      event: null,
      organizerEvents: organizerEvents.map((e) => ({ id: e.id, name: e.name })),
      counts: { all: 0, confirmed: 0, pending: 0, cancelled: 0, partially_cancelled: 0 },
      bookings: [],
      pagination: { page, pageSize, total: 0 },
    };
  }

  const searchWhere: WhereOptions = params.search
    ? {
        [Op.or]: [
          { bookingReference: { [Op.iLike]: `%${params.search}%` } },
          { primaryContactName: { [Op.iLike]: `%${params.search}%` } },
          { primaryContactEmail: { [Op.iLike]: `%${params.search}%` } },
        ],
      }
    : {};

  // Every booking (for this event, or for every event this organizer
  // owns) with its tickets, is needed to derive status correctly — status
  // filtering therefore happens in application code below, not via a
  // WHERE clause on the DB status column.
  const allBookings = await Booking.findAll({
    where: { ...(singleEvent ? { eventId: singleEvent.id } : {}), ...searchWhere },
    include: [
      { model: Ticket },
      { model: Payment, limit: 1, order: [['createdAt', 'DESC']] },
      wantsAllEvents
        ? { model: Event, attributes: ['id', 'name'], where: { organizerId } }
        : { model: Event, attributes: ['id', 'name'] },
    ],
    order: [['createdAt', params.sort === 'oldest' ? 'ASC' : 'DESC']],
  });

  const rows: OrganizerBookingRow[] = allBookings.map((b) => {
    const tickets = (b as unknown as { Tickets: Ticket[] }).Tickets ?? [];
    const payments = (b as unknown as { Payments: Payment[] }).Payments ?? [];
    const bookingEvent = (b as unknown as { Event: Event }).Event;
    const activeTicketCount = tickets.filter((t) => t.status !== 'cancelled').length;
    return {
      id: b.id,
      bookingReference: b.bookingReference,
      customerName: b.primaryContactName,
      customerEmail: b.primaryContactEmail,
      customerPhone: b.primaryContactWhatsapp,
      eventId: singleEvent ? singleEvent.id : bookingEvent.id,
      eventName: singleEvent ? singleEvent.name : bookingEvent.name,
      ticketCount: activeTicketCount,
      totalAmountPaise: b.totalAmountPaise,
      paymentStatus: payments[0]?.status ?? null,
      displayStatus: deriveStatus(b.status, tickets),
      createdAt: b.createdAt.toISOString(),
    };
  });

  const counts: Record<'all' | DisplayBookingStatus, number> = {
    all: rows.length,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    partially_cancelled: 0,
  };
  for (const r of rows) counts[r.displayStatus] += 1;

  const filtered = params.status && params.status !== 'all' ? rows.filter((r) => r.displayStatus === params.status) : rows;

  const sorted = [...filtered].sort((a, b) => {
    if (params.sort === 'amount_desc') return b.totalAmountPaise - a.totalAmountPaise;
    if (params.sort === 'amount_asc') return a.totalAmountPaise - b.totalAmountPaise;
    return 0; // newest/oldest already applied at the DB query level above
  });

  const total = sorted.length;
  const paged = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  return {
    organizerName: organizer?.name ?? 'Organizer',
    event: singleEvent
      ? { id: singleEvent.id, name: singleEvent.name, eventDate: singleEvent.eventDate.toISOString(), status: singleEvent.status }
      : null,
    organizerEvents: organizerEvents.map((e) => ({ id: e.id, name: e.name })),
    counts,
    bookings: paged,
    pagination: { page, pageSize, total },
  };
}
