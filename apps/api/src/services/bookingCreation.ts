import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/connection';
import { Event, TicketCategory, Booking, Ticket, Payment, Organizer } from '../models';
import { randomUUID, randomInt } from 'crypto';
import { isCustomerBlocked } from './accountBlocks';
import { collectionModeFor } from './organizerSettlements';

export interface BookingItem {
  ticketCategoryId: string;
  quantity: number;
}

export interface CreateBookingParams {
  eventId: string;
  // One entry per ticket type in the order. Tickets (and attendeeNames /
  // attendeeGenders) follow this order: all of the first item's tickets,
  // then the second's, and so on.
  items: BookingItem[];
  primaryContactName: string;
  primaryContactWhatsapp: string;
  primaryContactEmail: string;
  primaryContactCity?: string;
  paymentMethod: 'online' | 'cash';
  attendeeNames?: string[]; // one per ticket, in items order; falls back to the contact name
  attendeeGenders?: string[]; // one per ticket; required to match the event's real genderRestriction when one is set, otherwise unused
}

export class SoldOutError extends Error {
  constructor() {
    super('Not enough tickets remaining in this category');
  }
}

// Only ever thrown when the event's real genderRestriction is actually
// set — an event with none (the default) never asks for or checks
// gender at all, so this class exists purely for the restricted case.
export class GenderRestrictionError extends Error {}

export class NotFoundError extends Error {}

// A request that's well-formed JSON but can never become a real booking:
// a fractional/oversized quantity, more tickets than the tier allows per
// booking, or an event that isn't open for sale (draft, cancelled,
// closed, or already started).
export class BookingValidationError extends Error {}

// A paid ticket booked online needs some way to collect the money: a
// vendor split for a verified organizer, or the platform's own account
// for one still being verified. Only a vendor Cashfree has blocked has
// neither. Cash bookings are unaffected: the organizer collects that
// money directly, no Cashfree involvement at all.
export class OrganizerNotVerifiedError extends Error {
  constructor() {
    super('Online payment is not available for this event right now — please contact the organizer');
  }
}

// Crockford base32 (no I/L/O/U) — unambiguous when read aloud or typed
// from a printed ticket. 8 characters from a CSPRNG gives ~1.1e12
// possible suffixes per year: collisions (which the unique constraint
// would turn into a failed booking) are negligible at any realistic
// volume, and references can't be enumerated by guessing — which
// matters because reference + email is what the customer-facing
// lookup endpoints accept.
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_SUFFIX_LENGTH = 8;

export function generateBookingReference(): string {
  const year = new Date().getFullYear();
  let suffix = '';
  for (let i = 0; i < REFERENCE_SUFFIX_LENGTH; i += 1) {
    suffix += REFERENCE_ALPHABET[randomInt(0, REFERENCE_ALPHABET.length)];
  }
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
  paymentId: string;
  totalAmountPaise: number;
  organizerId: string;
  // Everything needed to send the confirmation email, returned here
  // rather than re-queried by the caller — this transaction already
  // has all of it loaded.
  email: {
    eventName: string;
    eventDate: Date;
    venueAddress: string | null;
    organizerName: string;
    customerName: string;
    customerEmail: string;
    // Ticket types joined ("General, VIP") when the order has several;
    // unitPricePaise is then the first type's price.
    tierName: string;
    unitPricePaise: number;
    quantity: number;
    totalAmountPaise: number;
    ticketQrTokens: string[];
  };
}

export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new BookingValidationError('Choose at least one ticket');
  }
  // Must be a whole number: a fractional quantity (e.g. 1.4) would
  // otherwise issue 2 tickets from the ticket loop below, charge 1.4x
  // the price, and — because Postgres rounds `quota_remaining - 1.4`
  // back to an integer on assignment — decrement quota by only 1.
  for (const item of params.items) {
    if (typeof item?.ticketCategoryId !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new BookingValidationError('Quantity must be a whole number of at least 1');
    }
  }
  // Each ticket type at most once, so maxPerBooking can't be dodged by
  // splitting one type across several items.
  if (new Set(params.items.map((i) => i.ticketCategoryId)).size !== params.items.length) {
    throw new BookingValidationError('Each ticket type can only appear once in a booking');
  }
  const totalQuantity = params.items.reduce((sum, i) => sum + i.quantity, 0);

  return sequelize.transaction(async (t) => {
    const event = await Event.findByPk(params.eventId, { transaction: t });
    if (!event) throw new NotFoundError('Event not found');

    const categories = await TicketCategory.findAll({
      where: { id: params.items.map((i) => i.ticketCategoryId), eventId: params.eventId },
      transaction: t,
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const lines = params.items.map((item) => {
      const ticketCategory = categoryById.get(item.ticketCategoryId);
      if (!ticketCategory) throw new NotFoundError('Ticket category not found for this event');
      return { ticketCategory, quantity: item.quantity };
    });

    // The public site only ever links to published, upcoming events —
    // but this endpoint is callable directly, so the same rule has to
    // hold here too, not just in the UI.
    if (event.status !== 'published') {
      throw new BookingValidationError('This event is not open for booking');
    }
    // Suspended by Inveon (super admin portal): the organizer's events
    // and the customer's email can't take new bookings.
    const eventOrganizer = await Organizer.findByPk(event.organizerId, { attributes: ['blockedAt'], transaction: t });
    if (eventOrganizer?.blockedAt) throw new BookingValidationError('This event is not open for booking');
    if (await isCustomerBlocked(params.primaryContactEmail)) {
      throw new BookingValidationError('Bookings from this email address are not allowed. Please contact support.');
    }
    if (event.eventDate.getTime() <= Date.now()) {
      throw new BookingValidationError('This event has already started — booking is closed');
    }
    for (const { ticketCategory, quantity } of lines) {
      if (quantity > ticketCategory.maxPerBooking) {
        throw new BookingValidationError(
          lines.length > 1
            ? `You can book at most ${ticketCategory.maxPerBooking} ${ticketCategory.name} ticket(s) in one booking`
            : `You can book at most ${ticketCategory.maxPerBooking} ticket(s) of this type in one booking`,
        );
      }
    }

    // Checked before any quota is reserved — a doomed booking (wrong or
    // missing gender for a restricted event) should never lock stock
    // away from someone who could actually complete it. An event with
    // no restriction set (the default) skips this entirely, so nothing
    // here ever runs, let alone asks, for the unrestricted case.
    if (event.genderRestriction) {
      for (let i = 0; i < totalQuantity; i += 1) {
        const gender = params.attendeeGenders?.[i];
        if (gender !== event.genderRestriction) {
          throw new GenderRestrictionError(
            `This event is open to ${event.genderRestriction} attendees only. Please confirm each attendee's gender matches before booking.`,
          );
        }
      }
    }

    const totalAmountPaise = lines.reduce((sum, l) => sum + l.ticketCategory.pricePaise * l.quantity, 0);

    if (params.paymentMethod === 'online' && totalAmountPaise > 0) {
      const organizer = await Organizer.findByPk(event.organizerId, { transaction: t });
      // Verified organizers are paid by vendor split; unverified ones are
      // collected into the platform account and settled later (see
      // organizerSettlements.ts). Only a Cashfree-blocked vendor has no
      // way to take online payment.
      if (!collectionModeFor(organizer)) {
        throw new OrganizerNotVerifiedError();
      }
    }

    // One reservation per ticket type, taken in a fixed (id) order so two
    // mixed orders over the same types can't deadlock each other. If any
    // type is short, throwing rolls back the ones already taken.
    for (const { ticketCategory, quantity } of [...lines].sort((a, b) => a.ticketCategory.id.localeCompare(b.ticketCategory.id))) {
      // eslint-disable-next-line no-await-in-loop
      const updateResult = await sequelize.query<{ quota_remaining: number }>(
        `UPDATE ticket_categories
         SET quota_remaining = quota_remaining - :qty, updated_at = NOW()
         WHERE id = :id AND quota_remaining >= :qty
         RETURNING quota_remaining`,
        {
          replacements: { qty: quantity, id: ticketCategory.id },
          type: QueryTypes.SELECT,
          transaction: t,
        },
      );

      if (updateResult.length === 0) {
        // Either sold out, or someone else's concurrent transaction won the
        // race and took the remaining stock first. Same user-facing outcome.
        throw new SoldOutError();
      }
    }

    const booking = await Booking.create(
      {
        eventId: event.id,
        bookingReference: generateBookingReference(),
        primaryContactName: params.primaryContactName,
        primaryContactWhatsapp: params.primaryContactWhatsapp,
        // Normalized once, here, so every later email-keyed lookup
        // (customer login, "my bookings") can match exactly.
        primaryContactEmail: params.primaryContactEmail.trim().toLowerCase(),
        primaryContactCity: params.primaryContactCity ?? null,
        // Reservation happens now, at booking creation, so two people can
        // never both reach checkout for the last ticket. A genuinely free
        // ticket (0 paise) is confirmed immediately — there's no payment
        // to collect at all. A cash booking still starts pending: the
        // organizer confirms it manually once they've actually collected
        // the cash (unchanged from before this pass). An online paid
        // booking stays pending until the Cashfree webhook confirms it
        // (see cashfreeOrders.ts), or gets cancelled and its quota
        // released if the payment fails or the customer abandons checkout.
        status: totalAmountPaise === 0 ? 'confirmed' : 'pending',
        paymentMethod: params.paymentMethod,
        totalAmountPaise,
      },
      { transaction: t },
    );

    const payment = await Payment.create(
      {
        bookingId: booking.id,
        amountPaise: totalAmountPaise,
        method: params.paymentMethod,
        status: booking.status === 'confirmed' ? 'paid' : 'pending',
      },
      { transaction: t },
    );

    const tickets: Ticket[] = [];
    for (const { ticketCategory, quantity } of lines) {
      for (let n = 0; n < quantity; n += 1) {
        const i = tickets.length;
        // eslint-disable-next-line no-await-in-loop
        const ticket = await Ticket.create(
          {
            bookingId: booking.id,
            ticketCategoryId: ticketCategory.id,
            attendeeName: params.attendeeNames?.[i] ?? params.primaryContactName,
            attendeeGender: params.attendeeGenders?.[i] ?? null,
            qrToken: randomUUID(),
            status: 'valid',
          },
          { transaction: t },
        );
        tickets.push(ticket);
      }
    }

    const organizer = await Organizer.findByPk(event.organizerId, { transaction: t });

    return {
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      paymentId: payment.id,
      totalAmountPaise,
      organizerId: event.organizerId,
      email: {
        eventName: event.name,
        eventDate: event.eventDate,
        venueAddress: event.venueAddress,
        organizerName: organizer?.name ?? 'Event Organizer',
        customerName: params.primaryContactName,
        customerEmail: params.primaryContactEmail.trim().toLowerCase(),
        tierName: lines.map((l) => l.ticketCategory.name).join(', '),
        unitPricePaise: lines[0].ticketCategory.pricePaise,
        quantity: totalQuantity,
        totalAmountPaise,
        ticketQrTokens: tickets.map((tk) => tk.qrToken),
      },
    };
  });
}
