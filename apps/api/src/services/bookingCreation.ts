import { QueryTypes } from 'sequelize';
import { sequelize } from '../db/connection';
import { Event, TicketCategory, Booking, Ticket, Payment, Organizer } from '../models';
import { randomUUID, randomInt } from 'crypto';

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

// A paid ticket booked online needs a Cashfree vendor split to actually
// pay the organizer their share — an organizer who hasn't completed
// verification has no vendor for that split to go to. Cash bookings are
// unaffected: the organizer collects that money directly, no Cashfree
// involvement at all.
export class OrganizerNotVerifiedError extends Error {
  constructor() {
    super('This organizer has not completed payment verification yet — online payment is not available for this event');
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
    tierName: string;
    unitPricePaise: number;
    quantity: number;
    totalAmountPaise: number;
    ticketQrTokens: string[];
  };
}

export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  // Must be a whole number: a fractional quantity (e.g. 1.4) would
  // otherwise issue 2 tickets from the ticket loop below, charge 1.4x
  // the price, and — because Postgres rounds `quota_remaining - 1.4`
  // back to an integer on assignment — decrement quota by only 1.
  if (!Number.isInteger(params.quantity) || params.quantity < 1) {
    throw new BookingValidationError('Quantity must be a whole number of at least 1');
  }

  return sequelize.transaction(async (t) => {
    const event = await Event.findByPk(params.eventId, { transaction: t });
    if (!event) throw new NotFoundError('Event not found');

    const ticketCategory = await TicketCategory.findOne({
      where: { id: params.ticketCategoryId, eventId: params.eventId },
      transaction: t,
    });
    if (!ticketCategory) throw new NotFoundError('Ticket category not found for this event');

    // The public site only ever links to published, upcoming events —
    // but this endpoint is callable directly, so the same rule has to
    // hold here too, not just in the UI.
    if (event.status !== 'published') {
      throw new BookingValidationError('This event is not open for booking');
    }
    if (event.eventDate.getTime() <= Date.now()) {
      throw new BookingValidationError('This event has already started — booking is closed');
    }
    if (params.quantity > ticketCategory.maxPerBooking) {
      throw new BookingValidationError(`You can book at most ${ticketCategory.maxPerBooking} ticket(s) of this type in one booking`);
    }

    // Checked before any quota is reserved — a doomed booking (wrong or
    // missing gender for a restricted event) should never lock stock
    // away from someone who could actually complete it. An event with
    // no restriction set (the default) skips this entirely, so nothing
    // here ever runs, let alone asks, for the unrestricted case.
    if (event.genderRestriction) {
      for (let i = 0; i < params.quantity; i += 1) {
        const gender = params.attendeeGenders?.[i];
        if (gender !== event.genderRestriction) {
          throw new GenderRestrictionError(
            `This event is open to ${event.genderRestriction} attendees only. Please confirm each attendee's gender matches before booking.`,
          );
        }
      }
    }

    if (params.paymentMethod === 'online' && ticketCategory.pricePaise > 0) {
      const organizer = await Organizer.findByPk(event.organizerId, { transaction: t });
      if (!organizer || organizer.cashfreeVendorStatus !== 'active') {
        throw new OrganizerNotVerifiedError();
      }
    }

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
    for (let i = 0; i < params.quantity; i += 1) {
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
        tierName: ticketCategory.name,
        unitPricePaise: ticketCategory.pricePaise,
        quantity: params.quantity,
        totalAmountPaise,
        ticketQrTokens: tickets.map((tk) => tk.qrToken),
      },
    };
  });
}
