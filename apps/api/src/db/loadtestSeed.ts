/* eslint-disable no-console -- this is a CLI script; printing status is the point */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { sequelize } from './connection';
import { Organizer, User, Event, TicketCategory, Booking, Ticket, Payment } from '../models';
import { hashPassword } from '../auth/password';
import { generateBookingReference } from '../services/bookingCreation';

// Seeds (and cleans up) the throwaway data the k6 load tests in
// /loadtest run against: an organizer you can log in as, an event with
// N confirmed tickets to scan (check-in / gate rush) and an event with a
// small quota to book against (booking rush).
//
//   LOADTEST_SEED_CONFIRM=yes npm run loadtest:seed -- --tickets 2000 --quota 300 --out loadtest/seed.json
//   LOADTEST_SEED_CONFIRM=yes npm run loadtest:seed -- --cleanup loadtest/seed.json
//
// Point it at a staging or local database — never production.

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function cleanup(file: string) {
  const seed = JSON.parse(readFileSync(file, 'utf8')) as { organizerId: string };
  const eventIds = (await Event.findAll({ where: { organizerId: seed.organizerId }, attributes: ['id'] })).map((e) => e.id);
  const bookingIds = (await Booking.findAll({ where: { eventId: eventIds }, attributes: ['id'] })).map((b) => b.id);
  await Payment.destroy({ where: { bookingId: bookingIds } });
  await Ticket.destroy({ where: { bookingId: bookingIds } });
  await Booking.destroy({ where: { id: bookingIds } });
  await TicketCategory.destroy({ where: { eventId: eventIds } });
  await Event.destroy({ where: { id: eventIds } });
  await User.destroy({ where: { organizerId: seed.organizerId } });
  await Organizer.destroy({ where: { id: seed.organizerId } });
  console.log(`Removed load-test organizer ${seed.organizerId} with ${eventIds.length} events and ${bookingIds.length} bookings.`);
}

async function seedGateEvent(organizerId: string, name: string, ticketCount: number, stamp: number) {
  const event = await Event.create({
    organizerId,
    name,
    venueAddress: 'Load test venue',
    eventDate: new Date(Date.now() + 60 * 60 * 1000),
    gateOpenTime: new Date(Date.now() - 60 * 60 * 1000),
    status: 'published',
    capacity: ticketCount,
  } as never);
  const tier = await TicketCategory.create({
    eventId: event.id, name: 'General', pricePaise: 50000, quotaTotal: ticketCount, quotaRemaining: 0,
  } as never);

  const qrTokens: string[] = [];
  const BATCH = 1000;
  for (let start = 0; start < ticketCount; start += BATCH) {
    const size = Math.min(BATCH, ticketCount - start);
    const bookings = Array.from({ length: size }, (_, i) => ({
      id: randomUUID(),
      eventId: event.id,
      bookingReference: generateBookingReference(),
      primaryContactName: `Attendee ${start + i + 1}`,
      primaryContactWhatsapp: '+919000000000',
      primaryContactEmail: `attendee-${start + i + 1}-${stamp}@example.com`,
      status: 'confirmed' as const,
      paymentMethod: 'cash' as const,
      totalAmountPaise: 50000,
    }));
    const tickets = bookings.map((b) => {
      const qrToken = randomUUID();
      qrTokens.push(qrToken);
      return { bookingId: b.id, ticketCategoryId: tier.id, attendeeName: b.primaryContactName, qrToken };
    });
    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async (transaction) => {
      await Booking.bulkCreate(bookings, { transaction });
      await Ticket.bulkCreate(tickets as never[], { transaction });
      await Payment.bulkCreate(bookings.map((b) => ({ bookingId: b.id, amountPaise: 50000, method: 'cash', status: 'paid' })) as never[], { transaction });
    });
  }
  return { eventId: event.id, qrTokens };
}

async function seed(ticketCount: number, quota: number, out: string) {
  const stamp = Date.now();
  const password = randomBytes(12).toString('base64url');
  const organizer = await Organizer.create({
    name: `Load Test Org ${stamp}`,
    slug: `loadtest-${stamp}`,
    cashfreeVendorStatus: 'active',
  });
  const email = `loadtest-${stamp}@example.com`;
  await User.create({
    organizerId: organizer.id,
    email,
    name: 'Load Test Owner',
    passwordHash: await hashPassword(password),
    role: 'organizer_owner',
    emailVerified: true,
  });

  // Two gate events so the steady check-in test and the gate-rush test
  // can each verify their own counts afterwards.
  const checkin = await seedGateEvent(organizer.id, `Load Test Check-in Event ${stamp}`, Math.ceil(ticketCount / 2), stamp);
  const rush = await seedGateEvent(organizer.id, `Load Test Gate Rush Event ${stamp}`, Math.floor(ticketCount / 2), stamp);

  const salesEvent = await Event.create({
    organizerId: organizer.id,
    name: `Load Test Booking Event ${stamp}`,
    venueAddress: 'Load test venue',
    eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'published',
    capacity: quota,
  } as never);
  const salesTier = await TicketCategory.create({
    eventId: salesEvent.id, name: 'General', pricePaise: 50000, quotaTotal: quota, quotaRemaining: quota, maxPerBooking: 10,
  } as never);

  const result = {
    organizerId: organizer.id,
    email,
    password,
    checkinEventId: checkin.eventId,
    checkinTokens: checkin.qrTokens,
    rushEventId: rush.eventId,
    rushTokens: rush.qrTokens,
    bookingEventId: salesEvent.id,
    bookingTierId: salesTier.id,
    bookingQuota: quota,
  };
  writeFileSync(out, JSON.stringify(result));
  console.log(`Seeded organizer ${email}: ${checkin.qrTokens.length} + ${rush.qrTokens.length} tickets to scan, booking quota ${quota}. Wrote ${out}.`);
}

async function main() {
  if (process.env.LOADTEST_SEED_CONFIRM !== 'yes') {
    console.error('Refusing to run: set LOADTEST_SEED_CONFIRM=yes, and make sure DATABASE_URL is a staging/local database.');
    process.exit(1);
  }
  const cleanupFile = arg('cleanup');
  if (cleanupFile) {
    await cleanup(cleanupFile);
  } else {
    await seed(Number(arg('tickets', '2000')), Number(arg('quota', '300')), arg('out', 'loadtest/seed.json')!);
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
