import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('organizer notifications feed (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let eventId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    const org = await Organizer.create({ name: `Notif Org ${suffix}`, slug: `notif-org-${suffix}` });
    const other = await Organizer.create({ name: `Other Notif Org ${suffix}`, slug: `other-notif-org-${suffix}` });
    organizerId = org.id;
    otherOrgId = other.id;
    const user = await User.create({
      organizerId, email: `notif-${suffix}@example.com`, passwordHash: await hashPassword('TestPassword123'), role: 'organizer_owner', emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: 'organizer_owner', organizerId });

    const event = await Event.create({ organizerId, name: 'Notif Trek', eventDate: new Date(Date.now() + 12 * 3600000), capacity: 3, status: 'published' });
    eventId = event.id;
    const tier = await TicketCategory.create({ eventId, name: 'Solo', pricePaise: 0, quotaTotal: 1, quotaRemaining: 1 });
    await TicketCategory.create({ eventId, name: 'Cash', pricePaise: 50000, quotaTotal: 5, quotaRemaining: 5 });
    const cashTier = await TicketCategory.findOne({ where: { eventId, name: 'Cash' } });

    await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tier.id, quantity: 1, primaryContactName: 'Asha', primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: `asha-${suffix}@example.com`, paymentMethod: 'cash',
    });
    await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: cashTier!.id, quantity: 2, primaryContactName: 'Ravi', primaryContactWhatsapp: '+919000000002',
      primaryContactEmail: `ravi-${suffix}@example.com`, paymentMethod: 'cash',
    });

    const otherEvent = await Event.create({ organizerId: otherOrgId, name: 'Someone Else\'s Event', eventDate: new Date(Date.now() + 86400000 * 5), capacity: 1, status: 'published' });
    const otherTier = await TicketCategory.create({ eventId: otherEvent.id, name: 'X', pricePaise: 0, quotaTotal: 5, quotaRemaining: 5 });
    await request(app).post(`/api/events/${otherEvent.id}/bookings`).send({
      ticketCategoryId: otherTier.id, quantity: 1, primaryContactName: 'Not Yours', primaryContactWhatsapp: '+919000000003',
      primaryContactEmail: `nope-${suffix}@example.com`, paymentMethod: 'cash',
    });
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId: [organizerId, otherOrgId] } });
    const ids = events.map((e) => e.id);
    const bookings = await Booking.findAll({ where: { eventId: ids } });
    await Payment.destroy({ where: { bookingId: bookings.map((b) => b.id) } });
    await Ticket.destroy({ where: { bookingId: bookings.map((b) => b.id) } });
    await Booking.destroy({ where: { eventId: ids } });
    await TicketCategory.destroy({ where: { eventId: ids } });
    await Event.destroy({ where: { id: ids } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: [organizerId, otherOrgId] } });
    await sequelize.close();
  });

  it('lists real activity for this organizer only: bookings, pending cash, sold-out tiers, events starting soon', async () => {
    const res = await request(app).get('/api/organizer/notifications').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = res.body.notifications.map((n: { title: string }) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['New booking', 'Cash booking awaiting payment', 'Ticket tier sold out', 'Event starting soon']));
    const text = JSON.stringify(res.body);
    expect(text).toContain('Asha booked 1 ticket for Notif Trek');
    expect(text).toContain('Ravi reserved 2 tickets for Notif Trek to pay ₹1,000 in cash');
    expect(text).not.toContain('Not Yours');
    // Stable ids, so read/dismissed state survives reloads.
    const again = await request(app).get('/api/organizer/notifications').set('Authorization', `Bearer ${token}`);
    expect(again.body.notifications.map((n: { id: string }) => n.id)).toEqual(res.body.notifications.map((n: { id: string }) => n.id));
  });

  it('reports checked-in counts on the organizer events list', async () => {
    const res = await request(app).get('/api/organizer/events').set('Authorization', `Bearer ${token}`);
    const row = res.body.events.find((e: { id: string }) => e.id === eventId);
    expect(row).toMatchObject({ ticketsSold: 3, checkedInCount: 0 });
  });
});
