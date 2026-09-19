import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/connection';
import { Event, TicketCategory, Booking, Ticket, Organizer } from '../models';
import { randomUUID } from 'crypto';

export interface CreateBookingParams {
  eventId: string;
  ticketCategoryId: string;
  quantity: number;
  primaryContactName: string;
  primaryContactWhatsapp: string;
  primaryContactEmail: string;
  primaryContactCity?: string;
  paymentMethod: 'online' | 'cash';
  attendeeNames?: string[]; // one per ticket; falls back to the contact name
}

export class SoldOutError extends Error {
  constructor() {
    super('Not enough tickets remaining in this category');
  }
}

export class NotFoundError extends Error {}

function generateBookingReference(): string {
  const year = new Date().getFullYear();
  const suffix = Math.floor(10000 + Math.random() * 90000);
  return `INV-BKG-${year}-${suffix}`;
}

/**
 * The atomic reservation guarantee lives entirely in this one UPDATE:
 *
 *   UPDATE ticket_categories
 *   SET quota_remaining = quota_remaining - :qty
 *   WHERE id = :id AND quota_remaining >= :qty
 *
 * Under Postgres's default READ COMMITTED isolation, a concurrent UPDATE
 * against the same row blocks until the first transaction commits or
 * rolls back, then re-evaluates its WHERE clause against the now-current
 * value — so two transactions racing for the last ticket can never both
 * see (and decrement from) quota_remaining = 1. One wins, the other's
 * WHERE clause fails to match (0 rows affected) and it's rejected with
 * SoldOutError. This is the standard, correct pattern for this problem;
 * it deliberately does NOT rely on Redis or application-level locking —
 * the database is the single source of truth for quota, so there's
 * nothing to keep in sync or get out of sync.
 */
export interface CreateBookingResult {
  bookingId: string;
  bookingReference: string;
  email: {
    eventName: string;
    eventDate: Date;
    venueAddress: string | null;
    organizerName: string;
    customerName: string;
    customerEmail: string;
    tierName: string;
    unitPricePaise: number;
    quantity: number;
    totalAmountPaise: number;
    ticketQrTokens: string[];
  };
}

export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  if (params.quantity < 1) {
    throw new Error('quantity must be at least 1');
  }

  return sequelize.transaction(async (t) => {
    const event = await Event.findByPk(params.eventId, { transaction: t });
    if (!event) throw new NotFoundError('Event not found');

    const ticketCategory = await TicketCategory.findOne({
      where: { id: params.ticketCategoryId, eventId: params.eventId },
      transaction: t,
    });
    if (!ticketCategory) throw new NotFoundError('Ticket category not found for this event');

    const updateResult = await sequelize.query<{ quota_remaining: number }>(
      `UPDATE ticket_categories
       SET quota_remaining = quota_remaining - :qty, updated_at = NOW()
       WHERE id = :id AND quota_remaining >= :qty
       RETURNING quota_remaining`,
      {
        replacements: { qty: params.quantity, id: ticketCategory.id },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );

    if (updateResult.length === 0) {
      // Either sold out, or someone else's concurrent transaction won the
      // race and took the remaining stock first. Same user-facing outcome.
      throw new SoldOutError();
    }

    const totalAmountPaise = ticketCategory.pricePaise * params.quantity;

    const booking = await Booking.create(
      {
        eventId: event.id,
        bookingReference: generateBookingReference(),
        primaryContactName: params.primaryContactName,
        primaryContactWhatsapp: params.primaryContactWhatsapp,
        primaryContactEmail: params.primaryContactEmail,
        primaryContactCity: params.primaryContactCity ?? null,
        // Reservation happens now, at booking creation, so two people can
        // never both reach checkout for the last ticket. Actual payment
        // confirmation (flipping this to 'confirmed', or releasing the
        // quota back on failure/timeout) is a separate step — not built
        // yet, since there's no real payment gateway integration.
        status: 'pending',
        paymentMethod: params.paymentMethod,
        totalAmountPaise,
      },
      { transaction: t },
    );

    const tickets: Ticket[] = [];
    for (let i = 0; i < params.quantity; i += 1) {
      const ticket = await Ticket.create(
        {
          bookingId: booking.id,
          ticketCategoryId: ticketCategory.id,
          attendeeName: params.attendeeNames?.[i] ?? params.primaryContactName,
          qrToken: randomUUID(),
          status: 'valid',
        },
        { transaction: t },
      );
      tickets.push(ticket);
    }

    const organizer = await Organizer.findByPk(event.organizerId, { transaction: t });

    return {
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      // Everything needed to send the confirmation email, returned here
      // rather than re-queried by the caller — this transaction already
      // has all of it loaded.
      email: {
        eventName: event.name,
        eventDate: event.eventDate,
        venueAddress: event.venueAddress,
        organizerName: organizer?.name ?? 'Event Organizer',
        customerName: params.primaryContactName,
        customerEmail: params.primaryContactEmail,
        tierName: ticketCategory.name,
        unitPricePaise: ticketCategory.pricePaise,
        quantity: params.quantity,
        totalAmountPaise,
        ticketQrTokens: tickets.map((tk) => tk.qrToken),
      },
    };
  });
}
