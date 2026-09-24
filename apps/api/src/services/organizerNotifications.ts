import { Op } from 'sequelize';
import { Booking, Event, Organizer, Ticket, TicketCategory } from '../models';

// The organizer's notification feed, derived from what actually happened
// on their account — there's no separate notifications table to fall out
// of sync. Ids are stable (one per underlying fact), so the client can
// remember which ones were read or dismissed.

export type NotificationCategory = 'bookings' | 'payments' | 'cancellations' | 'events' | 'security';

export interface OrganizerNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  link: string;
}

const LOOKBACK_DAYS = 30;
const MAX_ITEMS = 50;

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

export async function getOrganizerNotifications(organizerId: string, now: Date = new Date()): Promise<OrganizerNotification[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);
  const [organizer, events] = await Promise.all([
    Organizer.findByPk(organizerId),
    Event.findAll({ where: { organizerId }, attributes: ['id', 'name', 'eventDate', 'status'] }),
  ]);
  const eventIds = events.map((e) => e.id);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const items: OrganizerNotification[] = [];

  const bookings = await Booking.findAll({
    where: { eventId: { [Op.in]: eventIds }, [Op.or]: [{ createdAt: { [Op.gte]: since } }, { updatedAt: { [Op.gte]: since } }] },
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  const ticketCounts = new Map<string, number>();
  if (bookings.length) {
    const tickets = await Ticket.findAll({ where: { bookingId: bookings.map((b) => b.id) }, attributes: ['bookingId'] });
    for (const t of tickets) ticketCounts.set(t.bookingId, (ticketCounts.get(t.bookingId) ?? 0) + 1);
  }

  for (const b of bookings) {
    const eventName = eventById.get(b.eventId)?.name ?? 'your event';
    const n = ticketCounts.get(b.id) ?? 0;
    const tickets = `${n} ticket${n === 1 ? '' : 's'}`;

    if (b.createdAt >= since && (b.status === 'confirmed' || b.cancelledBy)) {
      items.push({
        id: `booking:${b.id}:created`,
        category: 'bookings',
        title: 'New booking',
        message: `${b.primaryContactName} booked ${tickets} for ${eventName}${b.totalAmountPaise > 0 ? ` (${rupees(b.totalAmountPaise)})` : ''}.`,
        createdAt: b.createdAt.toISOString(),
        link: '/organizer/bookings',
      });
    }
    if (b.status === 'pending' && b.paymentMethod === 'cash' && b.createdAt >= since) {
      items.push({
        id: `booking:${b.id}:cash-pending`,
        category: 'payments',
        title: 'Cash booking awaiting payment',
        message: `${b.primaryContactName} reserved ${tickets} for ${eventName} to pay ${rupees(b.totalAmountPaise)} in cash.`,
        createdAt: b.createdAt.toISOString(),
        link: '/organizer/bookings',
      });
    }
    if (b.status === 'cancelled' && b.cancelledBy && b.updatedAt >= since) {
      items.push({
        id: `booking:${b.id}:cancelled`,
        category: 'cancellations',
        title: b.cancelledBy === 'customer' ? 'Booking cancelled by customer' : 'Booking cancelled',
        message: `${b.bookingReference} (${b.primaryContactName}, ${eventName}) was cancelled${b.refundAmountPaise ? ` — refund ${rupees(b.refundAmountPaise)}` : ''}.`,
        createdAt: b.updatedAt.toISOString(),
        link: '/organizer/cancellations',
      });
    }
    if (b.refundStatus === 'failed' && b.updatedAt >= since) {
      items.push({
        id: `booking:${b.id}:refund-failed`,
        category: 'payments',
        title: 'Refund needs attention',
        message: `The automatic refund for ${b.bookingReference} (${rupees(b.refundAmountPaise ?? 0)}) failed — please refund ${b.primaryContactName} manually.`,
        createdAt: b.updatedAt.toISOString(),
        link: '/organizer/cancellations',
      });
    }
  }

  // Tiers that have sold out, for events still to come.
  const upcomingIds = events.filter((e) => e.status === 'published' && e.eventDate > now).map((e) => e.id);
  if (upcomingIds.length) {
    const soldOut = await TicketCategory.findAll({ where: { eventId: upcomingIds, quotaRemaining: 0, updatedAt: { [Op.gte]: since } } });
    for (const tier of soldOut) {
      items.push({
        id: `tier:${tier.id}:sold-out`,
        category: 'events',
        title: 'Ticket tier sold out',
        message: `"${tier.name}" for ${eventById.get(tier.eventId)?.name ?? 'your event'} is sold out (${tier.quotaTotal}/${tier.quotaTotal}).`,
        createdAt: tier.updatedAt.toISOString(),
        link: `/organizer/events/${tier.eventId}/tickets`,
      });
    }
  }

  // Events starting within the next 24 hours.
  for (const e of events) {
    const msUntil = e.eventDate.getTime() - now.getTime();
    if (e.status === 'published' && msUntil > 0 && msUntil <= 86400000) {
      items.push({
        id: `event:${e.id}:starting-soon`,
        category: 'events',
        title: 'Event starting soon',
        message: `${e.name} starts within 24 hours — open the check-in tool at the gate.`,
        createdAt: new Date(e.eventDate.getTime() - 86400000).toISOString(),
        link: '/organizer/check-in',
      });
    }
  }

  if (organizer?.cashfreeVendorStatus === 'active' && organizer.updatedAt >= since && organizer.kycSubmittedAt) {
    items.push({
      id: `organizer:${organizer.id}:payout-active`,
      category: 'security',
      title: 'Payout account verified',
      message: 'Your bank account is verified — online payments for paid tickets are enabled.',
      createdAt: organizer.updatedAt.toISOString(),
      link: '/organizer/settings/verification',
    });
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ITEMS);
}
