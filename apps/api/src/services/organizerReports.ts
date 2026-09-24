import { Op, WhereOptions } from 'sequelize';
import { Booking, Event, Payment, Ticket, TicketCategory, User } from '../models';

// Organizer reports (#64): attendees, sales and check-ins, as flat rows
// the portal previews and exports to CSV (opens in Excel). Everything is
// scoped to the caller's own events.

export const REPORT_TYPES = ['attendees', 'sales', 'checkins'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export class ReportValidationError extends Error {}

export interface ReportColumn {
  key: string;
  label: string;
}

export interface OrganizerReport {
  type: ReportType;
  generatedAt: string;
  events: { id: string; name: string }[];
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  summary: { label: string; value: string | number }[];
}

export interface ReportParams {
  organizerId: string;
  type: ReportType;
  eventId?: string;
  // Inclusive calendar dates (YYYY-MM-DD, IST) on the booking date — or
  // on the check-in time for the check-ins report.
  from?: string;
  to?: string;
}

const MAX_ROWS = 50_000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function istDayStart(date: string): Date {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ReportValidationError('Dates must be in YYYY-MM-DD format');
  }
  return new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS);
}

function dateRange(from?: string, to?: string): { [Op.gte]?: Date; [Op.lt]?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { [Op.gte]?: Date; [Op.lt]?: Date } = {};
  if (from) range[Op.gte] = istDayStart(from);
  if (to) range[Op.lt] = new Date(istDayStart(to).getTime() + 24 * 60 * 60 * 1000);
  if (range[Op.gte] && range[Op.lt] && range[Op.gte]! >= range[Op.lt]!) {
    throw new ReportValidationError('"From" must be on or before "To"');
  }
  return range;
}

function istLabel(date: Date | null): string | null {
  if (!date) return null;
  // "2026-12-25 19:00" in IST — sorts correctly and Excel reads it as a date.
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

const rupees = (paise: number | null | undefined) => (paise ? Math.round(paise) / 100 : 0);

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function getOrganizerReport(params: ReportParams): Promise<OrganizerReport> {
  if (!REPORT_TYPES.includes(params.type)) throw new ReportValidationError('Unknown report type');

  const allEvents = await Event.findAll({
    where: { organizerId: params.organizerId },
    attributes: ['id', 'name', 'eventDate'],
    order: [['eventDate', 'DESC']],
  });
  if (params.eventId && !allEvents.some((e) => e.id === params.eventId)) {
    throw new ReportValidationError('Event not found');
  }
  const events = params.eventId ? allEvents.filter((e) => e.id === params.eventId) : allEvents;
  const eventById = new Map(events.map((e) => [e.id, e]));
  const base = {
    type: params.type,
    generatedAt: new Date().toISOString(),
    events: allEvents.map((e) => ({ id: e.id, name: e.name })),
  };
  const eventIds = events.map((e) => e.id);
  const range = dateRange(params.from, params.to);

  if (params.type === 'sales') {
    const where: WhereOptions = { eventId: { [Op.in]: eventIds } };
    if (range) Object.assign(where, { createdAt: range });
    const bookings = eventIds.length
      ? await Booking.findAll({
        where,
        include: [
          { model: Ticket, attributes: ['id', 'status', 'ticketCategoryId'] },
          { model: Payment, attributes: ['status', 'method', 'createdAt'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: MAX_ROWS,
      })
      : [];
    const categoryIds = Array.from(new Set(bookings.flatMap((b) => (b.get('Tickets') as Ticket[]).map((t) => t.ticketCategoryId))));
    const categories = categoryIds.length ? await TicketCategory.findAll({ where: { id: { [Op.in]: categoryIds } }, attributes: ['id', 'name'] }) : [];
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    let gross = 0;
    let refunded = 0;
    let ticketsSold = 0;
    const rows = bookings.map((b) => {
      const tickets = b.get('Tickets') as Ticket[];
      const payments = (b.get('Payments') as Payment[]).slice().sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
      const tiers = Array.from(new Set(tickets.map((t) => categoryName.get(t.ticketCategoryId) ?? ''))).filter(Boolean).join(', ');
      const collected = b.status === 'confirmed' || (b.status === 'cancelled' && payments.some((p) => ['paid', 'refunded'].includes(p.status)));
      if (collected) gross += b.totalAmountPaise;
      if (b.status === 'confirmed') ticketsSold += tickets.filter((t) => t.status !== 'cancelled').length;
      refunded += b.refundStatus && ['SUCCESS', 'success'].includes(b.refundStatus) ? b.refundAmountPaise ?? 0 : 0;
      return {
        bookedAt: istLabel(b.createdAt),
        bookingReference: b.bookingReference,
        event: eventById.get(b.eventId)?.name ?? '',
        customerName: b.primaryContactName,
        customerEmail: b.primaryContactEmail,
        customerPhone: b.primaryContactWhatsapp,
        ticketTypes: tiers,
        tickets: tickets.length,
        amountRupees: rupees(b.totalAmountPaise),
        paymentMethod: b.paymentMethod,
        paymentStatus: payments[0]?.status ?? null,
        bookingStatus: b.status,
        refundRupees: rupees(b.refundAmountPaise),
        refundStatus: b.refundStatus,
      };
    });
    return {
      ...base,
      columns: [
        { key: 'bookedAt', label: 'Booked at (IST)' },
        { key: 'bookingReference', label: 'Booking reference' },
        { key: 'event', label: 'Event' },
        { key: 'customerName', label: 'Customer' },
        { key: 'customerEmail', label: 'Email' },
        { key: 'customerPhone', label: 'Phone' },
        { key: 'ticketTypes', label: 'Ticket type' },
        { key: 'tickets', label: 'Tickets' },
        { key: 'amountRupees', label: 'Amount (INR)' },
        { key: 'paymentMethod', label: 'Payment method' },
        { key: 'paymentStatus', label: 'Payment status' },
        { key: 'bookingStatus', label: 'Booking status' },
        { key: 'refundRupees', label: 'Refund (INR)' },
        { key: 'refundStatus', label: 'Refund status' },
      ],
      rows,
      summary: [
        { label: 'Bookings', value: rows.length },
        { label: 'Tickets sold', value: ticketsSold },
        { label: 'Gross collected', value: inr(gross) },
        { label: 'Refunded', value: inr(refunded) },
        { label: 'Net', value: inr(gross - refunded) },
      ],
    };
  }

  // attendees + checkins are both per ticket.
  const bookingWhere: WhereOptions = { eventId: { [Op.in]: eventIds } };
  const ticketWhere: WhereOptions = {};
  if (params.type === 'checkins') {
    Object.assign(ticketWhere, { checkedInAt: range ?? { [Op.ne]: null } });
  } else if (range) {
    Object.assign(bookingWhere, { createdAt: range });
  }
  const tickets = eventIds.length
    ? await Ticket.findAll({
      where: ticketWhere,
      include: [{ model: Booking, required: true, where: bookingWhere }],
      order: params.type === 'checkins' ? [['checkedInAt', 'ASC']] : [['createdAt', 'ASC']],
      limit: MAX_ROWS,
    })
    : [];
  const categoryIds = Array.from(new Set(tickets.map((t) => t.ticketCategoryId)));
  const categories = categoryIds.length ? await TicketCategory.findAll({ where: { id: { [Op.in]: categoryIds } }, attributes: ['id', 'name'] }) : [];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  if (params.type === 'checkins') {
    const staffIds = Array.from(new Set(tickets.map((t) => t.checkedInByUserId).filter((id): id is string => Boolean(id))));
    const staff = staffIds.length ? await User.findAll({ where: { id: { [Op.in]: staffIds } }, attributes: ['id', 'name', 'email'] }) : [];
    const staffName = new Map(staff.map((u) => [u.id, u.name || u.email]));

    // Per-event progress: checked in vs. all active tickets.
    const activeCounts = eventIds.length
      ? ((await Ticket.count({
        where: { status: { [Op.ne]: 'cancelled' } },
        include: [{ model: Booking, required: true, where: { eventId: { [Op.in]: eventIds }, status: 'confirmed' }, attributes: [] }],
      })) as number)
      : 0;
    const rows = tickets.map((t) => {
      const booking = t.get('Booking') as Booking;
      return {
        checkedInAt: istLabel(t.checkedInAt),
        attendeeName: t.attendeeName,
        event: eventById.get(booking.eventId)?.name ?? '',
        ticketType: categoryName.get(t.ticketCategoryId) ?? '',
        bookingReference: booking.bookingReference,
        customerPhone: booking.primaryContactWhatsapp,
        checkedInBy: t.checkedInByUserId ? staffName.get(t.checkedInByUserId) ?? '' : '',
      };
    });
    const checkedIn = tickets.filter((t) => t.status === 'checked_in').length;
    return {
      ...base,
      columns: [
        { key: 'checkedInAt', label: 'Checked in at (IST)' },
        { key: 'attendeeName', label: 'Attendee' },
        { key: 'event', label: 'Event' },
        { key: 'ticketType', label: 'Ticket type' },
        { key: 'bookingReference', label: 'Booking reference' },
        { key: 'customerPhone', label: 'Phone' },
        { key: 'checkedInBy', label: 'Checked in by' },
      ],
      rows,
      summary: [
        { label: 'Checked in', value: checkedIn },
        { label: 'Confirmed tickets', value: activeCounts },
        { label: 'Turnout', value: activeCounts ? `${Math.round((checkedIn / activeCounts) * 100)}%` : '—' },
      ],
    };
  }

  const rows = tickets.map((t) => {
    const booking = t.get('Booking') as Booking;
    const event = eventById.get(booking.eventId);
    return {
      attendeeName: t.attendeeName,
      age: t.attendeeAge,
      gender: t.attendeeGender,
      customerEmail: booking.primaryContactEmail,
      customerPhone: booking.primaryContactWhatsapp,
      city: booking.primaryContactCity,
      event: event?.name ?? '',
      eventDate: istLabel(event?.eventDate ?? null),
      ticketType: categoryName.get(t.ticketCategoryId) ?? '',
      bookingReference: booking.bookingReference,
      bookingStatus: booking.status,
      ticketStatus: t.status,
      checkedInAt: istLabel(t.checkedInAt),
    };
  });
  return {
    ...base,
    columns: [
      { key: 'attendeeName', label: 'Attendee' },
      { key: 'age', label: 'Age' },
      { key: 'gender', label: 'Gender' },
      { key: 'customerEmail', label: 'Email' },
      { key: 'customerPhone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'event', label: 'Event' },
      { key: 'eventDate', label: 'Event date (IST)' },
      { key: 'ticketType', label: 'Ticket type' },
      { key: 'bookingReference', label: 'Booking reference' },
      { key: 'bookingStatus', label: 'Booking status' },
      { key: 'ticketStatus', label: 'Ticket status' },
      { key: 'checkedInAt', label: 'Checked in at (IST)' },
    ],
    rows,
    summary: [
      { label: 'Tickets', value: rows.length },
      { label: 'Confirmed', value: rows.filter((r) => r.bookingStatus === 'confirmed' && r.ticketStatus !== 'cancelled').length },
      { label: 'Checked in', value: rows.filter((r) => r.ticketStatus === 'checked_in').length },
    ],
  };
}
