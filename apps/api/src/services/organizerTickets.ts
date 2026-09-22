import { Op } from 'sequelize';
import { Organizer, Event, Booking, Ticket, TicketCategory } from '../models';

export interface OrganizerTicketRow {
  id: string;
  attendeeName: string;
  customerEmail: string;
  customerPhone: string;
  eventId: string;
  eventName: string;
  tierName: string;
  bookingId: string;
  bookingReference: string;
  status: 'valid' | 'checked_in' | 'cancelled';
  checkedInAt: string | null;
}

export interface OrganizerTicketsResult {
  organizerName: string;
  organizerEvents: { id: string; name: string }[];
  counts: { all: number; valid: number; checked_in: number; cancelled: number };
  tickets: OrganizerTicketRow[];
}

export interface OrganizerTicketsParams {
  organizerId: string;
  eventId?: string;
  status?: 'all' | 'valid' | 'checked_in' | 'cancelled';
  search?: string;
}

// One real query across every ticket this organizer has ever issued,
// not per-event — the previous mock data (participants array in
// EventsContext) had no backend at all behind it. attendeeName comes
// from the ticket itself (one name per ticket, since a single booking
// can cover several attendees); contact info comes from the booking
// that ticket belongs to, since only the booking's primary contact
// has an email/phone on file.
export async function getOrganizerTickets(params: OrganizerTicketsParams): Promise<OrganizerTicketsResult> {
  const { organizerId } = params;

  const [organizer, organizerEvents] = await Promise.all([
    Organizer.findByPk(organizerId),
    Event.findAll({ where: { organizerId }, attributes: ['id', 'name'], order: [['eventDate', 'DESC']] }),
  ]);

  const eventIds = params.eventId ? [params.eventId] : organizerEvents.map((e) => e.id);

  const where: Record<string, unknown> = {};
  if (params.status && params.status !== 'all') where.status = params.status;

  const tickets = await Ticket.findAll({
    where,
    include: [
      {
        model: Booking,
        required: true,
        where: { eventId: { [Op.in]: eventIds } },
        include: [{ model: Event, attributes: ['id', 'name'] }],
      },
      { model: TicketCategory, attributes: ['name'] },
    ],
    order: [['createdAt', 'DESC']],
  });

  let rows: OrganizerTicketRow[] = tickets.map((ticket) => {
    const booking = (ticket as unknown as { Booking: Booking & { Event: Event } }).Booking;
    const tier = (ticket as unknown as { TicketCategory: TicketCategory | null }).TicketCategory;
    return {
      id: ticket.id,
      attendeeName: ticket.attendeeName,
      customerEmail: booking.primaryContactEmail,
      customerPhone: booking.primaryContactWhatsapp,
      eventId: booking.eventId,
      eventName: booking.Event?.name ?? 'Unknown event',
      tierName: tier?.name ?? 'General',
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
    };
  });

  if (params.search?.trim()) {
    const q = params.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.attendeeName.toLowerCase().includes(q) ||
        r.customerEmail.toLowerCase().includes(q) ||
        r.eventName.toLowerCase().includes(q) ||
        r.bookingReference.toLowerCase().includes(q),
    );
  }

  const allForCounts = params.status && params.status !== 'all' ? await Ticket.findAll({
    include: [{ model: Booking, required: true, where: { eventId: { [Op.in]: eventIds } }, attributes: [] }],
    attributes: ['status'],
  }) : tickets;

  const counts = {
    all: allForCounts.length,
    valid: allForCounts.filter((t) => t.status === 'valid').length,
    checked_in: allForCounts.filter((t) => t.status === 'checked_in').length,
    cancelled: allForCounts.filter((t) => t.status === 'cancelled').length,
  };

  return {
    organizerName: organizer?.name ?? '',
    organizerEvents: organizerEvents.map((e) => ({ id: e.id, name: e.name })),
    counts,
    tickets: rows,
  };
}
