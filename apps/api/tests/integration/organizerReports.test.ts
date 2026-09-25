import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

jest.mock('../../src/services/email', () => {
  const actual = jest.requireActual('../../src/services/email');
  return { ...actual, sendEmail: jest.fn().mockResolvedValue(undefined), isEmailConfigured: jest.fn().mockReturnValue(false) };
});

// Organizer reports (#64): attendees, sales, check-ins — real DB.
describe('organizer reports', () => {
  const app = createApp();
  const suffix = Date.now();
  const organizerIds: string[] = [];
  let token: string;
  let otherToken: string;
  let userId: string;
  let eventA: string;
  let eventB: string;
  let otherEvent: string;

  async function makeOrganizer(label: string) {
    const organizer = await Organizer.create({
      name: `Reports ${label} ${suffix}`,
      slug: `reports-${label}-${suffix}`,
      cashfreeVendorId: `reports_${label}_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerIds.push(organizer.id);
    const user = await User.create({
      organizerId: organizer.id,
      email: `reports-${label}-${suffix}@example.com`,
      name: `Gate ${label}`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    return { token: signAccessToken({ sub: user.id, role: user.role, organizerId: organizer.id }), userId: user.id };
  }

  async function createEvent(authToken: string, title: string, price = 500) {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title,
        startDate: '2026-12-25',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price, quantity: 50 }],
        status: 'published',
      });
    return res.body.id as string;
  }

  async function book(eventId: string, name: string, quantity: number, confirm: boolean) {
    const tier = (await TicketCategory.findOne({ where: { eventId } }))!;
    const res = await request(app)
      .post(`/api/events/${eventId}/bookings`)
      .send({
        ticketCategoryId: tier.id,
        quantity,
        primaryContactName: name,
        primaryContactWhatsapp: '+919000000001',
        primaryContactEmail: `${name.toLowerCase().replace(/\W+/g, '-')}-${suffix}@example.com`,
        paymentMethod: 'cash',
      });
    if (confirm) {
      await Booking.update({ status: 'confirmed' }, { where: { id: res.body.bookingId } });
      await Payment.update({ status: 'paid' }, { where: { bookingId: res.body.bookingId } });
    }
    return res.body.bookingId as string;
  }

  beforeAll(async () => {
    ({ token, userId } = await makeOrganizer('main'));
    ({ token: otherToken } = await makeOrganizer('other'));
    eventA = await createEvent(token, `Report Event A ${suffix}`);
    eventB = await createEvent(token, `Report Event B ${suffix}`, 1000);
    otherEvent = await createEvent(otherToken, `Other Org Event ${suffix}`);

    const a1 = await book(eventA, '=Alice', 2, true);
    await book(eventA, 'Bob Pending', 1, false);
    await book(eventB, 'Carol', 1, true);
    await book(otherEvent, 'Mallory', 1, true);

    const [first] = await Ticket.findAll({ where: { bookingId: a1 }, order: [['createdAt', 'ASC']] });
    await first.update({ status: 'checked_in', checkedInAt: new Date(), checkedInByUserId: userId });
  });

  afterAll(async () => {
    for (const organizerId of organizerIds) {
      const events = await Event.findAll({ where: { organizerId } });
      for (const event of events) {
        const bookings = await Booking.findAll({ where: { eventId: event.id } });
        for (const booking of bookings) {
          await Payment.destroy({ where: { bookingId: booking.id } });
          await Ticket.destroy({ where: { bookingId: booking.id } });
        }
        await Booking.destroy({ where: { eventId: event.id } });
        await TicketCategory.destroy({ where: { eventId: event.id } });
      }
      await Event.destroy({ where: { organizerId } });
      await User.destroy({ where: { organizerId } });
      await Organizer.destroy({ where: { id: organizerId } });
    }
    await sequelize.close();
  });

  const get = (path: string, authToken = token) =>
    request(app).get(`/api/organizer/reports/${path}`).set('Authorization', `Bearer ${authToken}`);

  it("sales: one row per booking across all events, with real totals — never another organizer's", async () => {
    const res = await get('sales');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(3);
    expect(res.body.rows.map((r: { customerName: string }) => r.customerName).sort()).toEqual(['=Alice', 'Bob Pending', 'Carol']);
    const summary = Object.fromEntries(res.body.summary.map((s: { label: string; value: unknown }) => [s.label, s.value]));
    expect(summary.Bookings).toBe(3);
    expect(summary['Tickets sold']).toBe(3);
    expect(summary['Gross collected']).toBe('₹2,000.00'); // 2 × 500 + 1 × 1000; the pending one isn't collected
    const alice = res.body.rows.find((r: { customerName: string }) => r.customerName === '=Alice');
    expect(alice).toMatchObject({
      tickets: 2,
      amountRupees: 1000,
      paymentStatus: 'paid',
      bookingStatus: 'confirmed',
      ticketTypes: 'General',
    });
    expect(res.body.events.map((e: { id: string }) => e.id).sort()).toEqual([eventA, eventB].sort());
  });

  it('filters by event and by date', async () => {
    const byEvent = await get(`sales?eventId=${eventB}`);
    expect(byEvent.body.rows).toHaveLength(1);
    expect(byEvent.body.rows[0].customerName).toBe('Carol');

    const future = await get('sales?from=2099-01-01');
    expect(future.body.rows).toHaveLength(0);

    expect((await get('sales?from=2026-13-40')).status).toBe(400);
    expect((await get('sales?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await get(`sales?eventId=${otherEvent}`)).status).toBe(400);
    expect((await get('payouts')).status).toBe(404);
  });

  it('attendees: one row per ticket with check-in status', async () => {
    const res = await get(`attendees?eventId=${eventA}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(3);
    const summary = Object.fromEntries(res.body.summary.map((s: { label: string; value: unknown }) => [s.label, s.value]));
    expect(summary).toMatchObject({ Tickets: 3, Confirmed: 2, 'Checked in': 1 });
    expect(res.body.rows.filter((r: { checkedInAt: string | null }) => r.checkedInAt)).toHaveLength(1);
  });

  it('check-ins: who was scanned, when and by whom, with turnout', async () => {
    const res = await get('checkins');
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ attendeeName: expect.any(String), checkedInBy: 'Gate main' });
    const summary = Object.fromEntries(res.body.summary.map((s: { label: string; value: unknown }) => [s.label, s.value]));
    expect(summary).toMatchObject({ 'Checked in': 1, 'Confirmed tickets': 3, Turnout: '33%' });
  });

  it('requires an organizer login', async () => {
    expect((await request(app).get('/api/organizer/reports/sales')).status).toBe(401);
    const other = await get('sales', otherToken);
    expect(other.body.rows).toHaveLength(1);
    expect(other.body.rows[0].customerName).toBe('Mallory');
  });
});
