import { Op, fn, col } from 'sequelize';
import { sequelize } from '../db/connection';
import { Organizer, Event, Booking, Ticket, Payment } from '../models';

export interface DashboardEventSummary {
  id: string;
  name: string;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  status: string;
  capacity: number;
  bookedCount: number;
  revenuePaise: number;
}

export interface DashboardBookingSummary {
  id: string;
  bookingReference: string;
  eventName: string;
  customerName: string;
  ticketCount: number;
  totalAmountPaise: number;
  status: string;
}

export interface DashboardActivityDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface OrganizerDashboard {
  organizerName: string;
  totalEvents: number;
  upcomingEventsCount: number;
  nextUpcomingEventName: string | null;
  totalBookings: number;
  bookingsThisWeek: number;
  totalParticipants: number;
  revenuePaiseThisMonth: number;
  checkedInCount: number;
  checkedInEligibleCount: number;
  upcomingEvents: DashboardEventSummary[];
  recentBookings: DashboardBookingSummary[];
  bookingActivity: DashboardActivityDay[];
}

const UPCOMING_EVENTS_LIMIT = 5;
const RECENT_BOOKINGS_LIMIT = 5;
const ACTIVITY_DAYS = 14;

export async function getOrganizerDashboard(organizerId: string): Promise<OrganizerDashboard> {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const eventWhere = { organizerId };
  const upcomingWhere = { organizerId, status: 'published' as const, eventDate: { [Op.gte]: now } };

  const [
    organizer,
    totalEvents,
    upcomingEventsCount,
    nextUpcomingEvent,
    totalBookings,
    bookingsThisWeek,
    totalParticipants,
    revenueThisMonthRow,
    checkedInCount,
    checkedInEligibleCount,
    upcomingEventRows,
    recentBookingRows,
    activityRows,
  ] = await Promise.all([
    Organizer.findByPk(organizerId),
    Event.count({ where: eventWhere }),
    Event.count({ where: upcomingWhere }),
    Event.findOne({ where: upcomingWhere, order: [['eventDate', 'ASC']] }),
    Booking.count({ include: [{ model: Event, where: eventWhere, attributes: [] }] }),
    Booking.count({
      include: [{ model: Event, where: eventWhere, attributes: [] }],
      where: { createdAt: { [Op.gte]: startOfWeek } },
    }),
    Ticket.count({
      include: [{ model: Booking, attributes: [], include: [{ model: Event, where: eventWhere, attributes: [] }] }],
      where: { status: { [Op.ne]: 'cancelled' } },
    }),
    Payment.findOne({
      attributes: [[fn('COALESCE', fn('SUM', col('Payment.amount_paise')), 0), 'total']],
      include: [{ model: Booking, attributes: [], include: [{ model: Event, where: eventWhere, attributes: [] }] }],
      where: { status: 'paid', createdAt: { [Op.gte]: startOfMonth } },
      raw: true,
    }),
    Ticket.count({
      include: [{ model: Booking, attributes: [], include: [{ model: Event, where: eventWhere, attributes: [] }] }],
      where: { status: 'checked_in' },
    }),
    Ticket.count({
      include: [{ model: Booking, attributes: [], include: [{ model: Event, where: eventWhere, attributes: [] }] }],
      where: { status: { [Op.in]: ['valid', 'checked_in'] } },
    }),
    Event.findAll({
      where: upcomingWhere,
      order: [['eventDate', 'ASC']],
      limit: UPCOMING_EVENTS_LIMIT,
    }),
    Booking.findAll({
      include: [{ model: Event, where: eventWhere, attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
      limit: RECENT_BOOKINGS_LIMIT,
    }),
    sequelize.query(
      `SELECT to_char(b.created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       WHERE e.organizer_id = :organizerId
         AND b.created_at >= :sinceDate
       GROUP BY 1
       ORDER BY 1 ASC`,
      {
        replacements: { organizerId, sinceDate: new Date(now.getTime() - (ACTIVITY_DAYS - 1) * 86400000) },
        type: 'SELECT',
      },
    ) as Promise<{ date: string; count: number }[]>,
  ]);

  const upcomingEvents: DashboardEventSummary[] = await Promise.all(
    upcomingEventRows.map(async (event) => {
      const [bookedCount, revenueRow] = await Promise.all([
        Ticket.count({
          include: [{ model: Booking, attributes: [], where: { eventId: event.id } }],
          where: { status: { [Op.ne]: 'cancelled' } },
        }),
        Payment.findOne({
          attributes: [[fn('COALESCE', fn('SUM', col('Payment.amount_paise')), 0), 'total']],
          include: [{ model: Booking, attributes: [], where: { eventId: event.id } }],
          where: { status: 'paid' },
          raw: true,
        }),
      ]);

      return {
        id: event.id,
        name: event.name,
        eventDate: event.eventDate.toISOString(),
        venueAddress: event.venueAddress,
        bannerUrl: event.bannerUrl,
        status: event.status,
        capacity: event.capacity,
        bookedCount,
        revenuePaise: Number((revenueRow as unknown as { total: string } | null)?.total ?? 0),
      };
    }),
  );

  const recentBookings: DashboardBookingSummary[] = await Promise.all(
    recentBookingRows.map(async (booking) => {
      const ticketCount = await Ticket.count({ where: { bookingId: booking.id, status: { [Op.ne]: 'cancelled' } } });
      const eventName = (booking as unknown as { Event: Event }).Event.name;
      return {
        id: booking.id,
        bookingReference: booking.bookingReference,
        eventName,
        customerName: booking.primaryContactName,
        ticketCount,
        totalAmountPaise: booking.totalAmountPaise,
        status: booking.status,
      };
    }),
  );

  const activityByDate = new Map(activityRows.map((row) => [row.date, row.count]));
  const bookingActivity: DashboardActivityDay[] = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
    const d = new Date(now.getTime() - (ACTIVITY_DAYS - 1 - i) * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    return { date: dateStr, count: activityByDate.get(dateStr) ?? 0 };
  });

  return {
    organizerName: organizer?.name ?? 'Organizer',
    totalEvents,
    upcomingEventsCount,
    nextUpcomingEventName: nextUpcomingEvent?.name ?? null,
    totalBookings,
    bookingsThisWeek,
    totalParticipants,
    revenuePaiseThisMonth: Number((revenueThisMonthRow as unknown as { total: string } | null)?.total ?? 0),
    checkedInCount,
    checkedInEligibleCount,
    upcomingEvents,
    recentBookings,
    bookingActivity,
  };
}
