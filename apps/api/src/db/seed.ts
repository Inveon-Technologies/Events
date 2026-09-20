/* eslint-disable no-console -- this is a CLI script; printing status is the point */
import { sequelize } from './connection';
import { Organizer, User, Event, TicketCategory, Booking, Ticket, Payment, Cancellation } from '../models';
import { hashPassword } from '../auth/password';

const ORGANIZER_SLUG = 'eco-pandhari';
const EVENT_YEAR = new Date().getFullYear();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const existing = await Organizer.findOne({ where: { slug: ORGANIZER_SLUG } });
  if (existing) {
    console.log(`Organizer '${ORGANIZER_SLUG}' already exists (id ${existing.id}) — wiping and reseeding.`);
    // bookings.event_id is deliberately ON DELETE RESTRICT (a real event
    // with real bookings should never silently cascade-delete them), so a
    // single Organizer.destroy() can't cascade all the way down — tear
    // down in explicit dependency order instead.
    const eventIds = (await Event.findAll({ where: { organizerId: existing.id }, attributes: ['id'] })).map((e) => e.id);
    const bookingIds = (await Booking.findAll({ where: { eventId: eventIds }, attributes: ['id'] })).map((b) => b.id);
    await Cancellation.destroy({ where: { bookingId: bookingIds } });
    await Payment.destroy({ where: { bookingId: bookingIds } });
    await Ticket.destroy({ where: { bookingId: bookingIds } });
    await Booking.destroy({ where: { id: bookingIds } });
    await TicketCategory.destroy({ where: { eventId: eventIds } });
    await Event.destroy({ where: { id: eventIds } });
    await User.destroy({ where: { organizerId: existing.id } });
    await existing.destroy();
  }

  const organizer = await Organizer.create({
    name: 'Eco Pandhari Club',
    slug: ORGANIZER_SLUG,
    contactEmail: 'hello@ecopandhari.example',
    about: 'Community trekking, cultural events, and adventure trips based in Pandharpur.',
  });

  const passwordHash = await hashPassword('password123');
  await User.create({
    organizerId: organizer.id,
    email: 'owner@ecopandhari.example',
    passwordHash,
    role: 'organizer_owner',
  });
  console.log('Login: owner@ecopandhari.example / password123');

  const trek = await Event.create({
    organizerId: organizer.id,
    name: 'Rajgad Sunrise Trek',
    slug: `rajgad-sunrise-trek-${EVENT_YEAR}`,
    tagline: 'Chase the sunrise from the fort of forts',
    eventDate: daysFromNow(20),
    venueAddress: 'Rajgad Fort, Pune',
    capacity: 150,
    status: 'published',
    bannerUrl: null,
  });
  const trekTier = await TicketCategory.create({
    eventId: trek.id,
    name: 'Solo Entry',
    pricePaise: 49900,
    quotaTotal: 150,
    quotaRemaining: 150 - 128,
  });

  const workshop = await Event.create({
    organizerId: organizer.id,
    name: 'Pune Business Workshop',
    slug: `pune-business-workshop-${EVENT_YEAR}`,
    tagline: 'A half-day workshop on scaling a small business',
    eventDate: daysFromNow(27),
    venueAddress: 'Pune',
    capacity: 50,
    status: 'published',
  });
  const workshopTier = await TicketCategory.create({
    eventId: workshop.id,
    name: 'General',
    pricePaise: 90000,
    quotaTotal: 50,
    quotaRemaining: 50 - 32,
  });

  const attendeeNames = [
    'Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Joshi', 'Vikram Singh',
    'Anjali Desai', 'Rohan Mehta', 'Kavya Nair', 'Arjun Rao', 'Divya Iyer',
  ];

  let nameIdx = 0;
  function nextName() {
    const name = attendeeNames[nameIdx % attendeeNames.length];
    nameIdx += 1;
    return name;
  }

  async function makeBooking(
    event: Event,
    tier: TicketCategory,
    ticketCount: number,
    opts: { status: 'confirmed' | 'pending' | 'cancelled'; checkedIn?: boolean; daysAgo?: number },
  ) {
    const contactName = nextName();
    const totalAmountPaise = tier.pricePaise * ticketCount;
    const createdAt = opts.daysAgo ? new Date(Date.now() - opts.daysAgo * 86400000) : new Date();

    const booking = await Booking.create({
      eventId: event.id,
      bookingReference: `EPC-2026-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      primaryContactName: contactName,
      primaryContactWhatsapp: '+91' + String(9000000000 + Math.floor(Math.random() * 99999999)),
      primaryContactEmail: `${contactName.toLowerCase().replace(' ', '.')}@example.com`,
      status: opts.status,
      paymentMethod: 'online',
      totalAmountPaise,
      createdAt,
      updatedAt: createdAt,
    });

    for (let i = 0; i < ticketCount; i += 1) {
      await Ticket.create({
        bookingId: booking.id,
        ticketCategoryId: tier.id,
        attendeeName: i === 0 ? contactName : nextName(),
        qrToken: `seed-${booking.id}-${i}`,
        status: opts.status === 'cancelled' ? 'cancelled' : opts.checkedIn ? 'checked_in' : 'valid',
        checkedInAt: opts.checkedIn ? createdAt : null,
      });
    }

    if (opts.status !== 'cancelled') {
      await Payment.create({
        bookingId: booking.id,
        amountPaise: totalAmountPaise,
        method: 'online',
        status: opts.status === 'confirmed' ? 'paid' : 'pending',
        gatewayReference: opts.status === 'confirmed' ? `pay_seed_${booking.id.slice(0, 8)}` : null,
        createdAt,
        updatedAt: createdAt,
      });
    }

    return booking;
  }

  // Trek: mostly confirmed + checked-in, one pending, one cancelled.
  await makeBooking(trek, trekTier, 3, { status: 'confirmed', checkedIn: true, daysAgo: 5 });
  await makeBooking(trek, trekTier, 2, { status: 'confirmed', checkedIn: true, daysAgo: 4 });
  await makeBooking(trek, trekTier, 1, { status: 'confirmed', checkedIn: false, daysAgo: 2 });
  await makeBooking(trek, trekTier, 4, { status: 'confirmed', checkedIn: false, daysAgo: 1 });
  await makeBooking(trek, trekTier, 2, { status: 'pending', daysAgo: 1 });
  await makeBooking(trek, trekTier, 1, { status: 'cancelled', daysAgo: 6 });

  // One "partially cancelled" booking — confirmed overall, but one of its
  // tickets was individually cancelled after the fact. This exercises the
  // derived (not stored) partially_cancelled status the bookings list
  // computes from ticket state.
  const partialBooking = await makeBooking(trek, trekTier, 3, { status: 'confirmed', daysAgo: 3 });
  const partialTickets = await Ticket.findAll({ where: { bookingId: partialBooking.id } });
  await partialTickets[0].update({ status: 'cancelled' });

  // Workshop: a smaller, newer set of bookings.
  await makeBooking(workshop, workshopTier, 2, { status: 'confirmed', daysAgo: 1 });
  await makeBooking(workshop, workshopTier, 1, { status: 'confirmed', daysAgo: 0 });

  console.log('Seeded:', organizer.name, '->', trek.name, '&', workshop.name);

  // A few more events, purely to exercise the My Events page's derived
  // statuses (draft, completed, cancelled) — none of these get bookings.
  await Event.create({
    organizerId: organizer.id,
    name: 'Sandhan Valley Night Trek',
    slug: `sandhan-valley-night-trek-${EVENT_YEAR}`,
    eventDate: daysFromNow(45),
    capacity: 80,
    status: 'draft',
  });
  await Event.create({
    organizerId: organizer.id,
    name: 'Pawna Lake Camping',
    slug: `pawna-lake-camping-${EVENT_YEAR}`,
    eventDate: daysFromNow(-10), // in the past — should derive to 'completed'
    venueAddress: 'Pawna Lake, Lonavala',
    capacity: 100,
    status: 'published',
  });
  await Event.create({
    organizerId: organizer.id,
    name: 'Monsoon Trek Challenge',
    slug: `monsoon-trek-challenge-${EVENT_YEAR}`,
    eventDate: daysFromNow(15),
    capacity: 60,
    status: 'cancelled',
  });
  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  await sequelize.close();
  process.exit(1);
});
