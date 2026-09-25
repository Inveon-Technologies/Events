import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, Payment, Ticket } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('organizer event management: get/edit/delete (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let otherOrganizerId: string;
  let otherToken: string;

  beforeAll(async () => {
    const organizer = await Organizer.create({
      name: `Event Mgmt Test Org ${suffix}`,
      slug: `event-mgmt-test-org-${suffix}`,
      cashfreeVendorId: `event_mgmt_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `event-mgmt-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const otherOrganizer = await Organizer.create({
      name: `Other Event Mgmt Org ${suffix}`,
      slug: `other-event-mgmt-org-${suffix}`,
    });
    otherOrganizerId = otherOrganizer.id;
    const otherUser = await User.create({
      organizerId: otherOrganizerId,
      email: `other-event-mgmt-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    otherToken = signAccessToken({ sub: otherUser.id, role: otherUser.role, organizerId: otherOrganizerId });
  });

  afterAll(async () => {
    for (const orgId of [organizerId, otherOrganizerId]) {
      const events = await Event.findAll({ where: { organizerId: orgId } });
      for (const event of events) {
        const bookings = await Booking.findAll({ where: { eventId: event.id } });
        for (const booking of bookings) {
          await Payment.destroy({ where: { bookingId: booking.id } });
          await Ticket.destroy({ where: { bookingId: booking.id } });
        }
        await Booking.destroy({ where: { eventId: event.id } });
        await TicketCategory.destroy({ where: { eventId: event.id } });
      }
      await Event.destroy({ where: { organizerId: orgId } });
      await User.destroy({ where: { organizerId: orgId } });
      await Organizer.destroy({ where: { id: orgId } });
    }
    await sequelize.close();
  });

  async function createTestEvent(overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Editable Event ${suffix}-${Math.random()}`,
        startDate: '2026-12-15',
        startTime: '09:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'draft',
        ...overrides,
      });
    return res.body as { id: string; slug: string };
  }

  it('GET returns the full editable detail, including tier id, price, quantity, and sold count', async () => {
    const created = await createTestEvent();
    const res = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toMatch(/^Editable Event/);
    expect(res.body.ticketTiers).toHaveLength(1);
    expect(res.body.ticketTiers[0]).toMatchObject({ name: 'General', price: 500, quantity: 20, sold: 0 });
    expect(res.body.ticketTiers[0].id).toEqual(expect.any(String));
  });

  it('GET refuses to return another organizer\'s event (403), and 404s for a nonexistent one', async () => {
    const created = await createTestEvent();
    const forbidden = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(403);

    const notFound = await request(app)
      .get('/api/organizer/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(notFound.status).toBe(404);
  });

  it('PATCH updates title/description/venue and leaves the slug unchanged', async () => {
    const created = await createTestEvent();
    const res = await request(app)
      .patch(`/api/organizer/events/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'A Brand New Title', description: 'Updated description', city: 'Mumbai' });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(created.slug); // stable, not regenerated

    const getRes = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.body.title).toBe('A Brand New Title');
    expect(getRes.body.description).toBe('Updated description');
    expect(getRes.body.venueAddress).toContain('Mumbai');
  });

  it('PATCH refuses to edit another organizer\'s event', async () => {
    const created = await createTestEvent();
    const res = await request(app)
      .patch(`/api/organizer/events/${created.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hijacked Title' });
    expect(res.status).toBe(403);
  });

  it('PATCH can freely change price/quantity on a tier with zero sales', async () => {
    const created = await createTestEvent();
    const getRes = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${token}`);
    const tierId = getRes.body.ticketTiers[0].id;

    const res = await request(app)
      .patch(`/api/organizer/events/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketTiers: [{ id: tierId, name: 'General', price: 750, quantity: 30 }] });
    expect(res.status).toBe(200);

    const after = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${token}`);
    expect(after.body.ticketTiers[0]).toMatchObject({ price: 750, quantity: 30 });
  });

  it('PATCH refuses to change the price of a tier that already has real sales', async () => {
    const created = await createTestEvent({ status: 'published' });
    const getRes = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${token}`);
    const tierId = getRes.body.ticketTiers[0].id;

    // A real booking against this tier.
    await request(app).post(`/api/events/${created.id}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Sale Test Customer',
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: `sale-test-${suffix}@example.com`,
      paymentMethod: 'cash',
    });

    const res = await request(app)
      .patch(`/api/organizer/events/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketTiers: [{ id: tierId, name: 'General', price: 999, quantity: 20 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already has 1 ticket/i);
  });

  it('PATCH refuses to drop a sold-out tier\'s quantity below what has already sold', async () => {
    const created = await createTestEvent({ status: 'published' });
    const getRes = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${token}`);
    const tierId = getRes.body.ticketTiers[0].id;

    await request(app).post(`/api/events/${created.id}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 3,
      primaryContactName: 'Quantity Test Customer',
      primaryContactWhatsapp: '+919000000002',
      primaryContactEmail: `qty-test-${suffix}@example.com`,
      paymentMethod: 'cash',
    });

    const res = await request(app)
      .patch(`/api/organizer/events/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketTiers: [{ id: tierId, name: 'General', price: 500, quantity: 2 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/below the 3 already sold/i);
  });

  it('PATCH refuses to remove a tier that already has sales, but allows removing an untouched one', async () => {
    const created = await createTestEvent({
      ticketTiers: [
        { name: 'Sold Tier', price: 500, quantity: 20 },
        { name: 'Untouched Tier', price: 300, quantity: 10 },
      ],
      status: 'published',
    });
    const getRes = await request(app).get(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${token}`);
    const soldTier = getRes.body.ticketTiers.find((t: { name: string }) => t.name === 'Sold Tier');

    await request(app).post(`/api/events/${created.id}/bookings`).send({
      ticketCategoryId: soldTier.id,
      quantity: 1,
      primaryContactName: 'Remove Test Customer',
      primaryContactWhatsapp: '+919000000003',
      primaryContactEmail: `remove-test-${suffix}@example.com`,
      paymentMethod: 'cash',
    });

    // Submitting only the sold tier — dropping the untouched one, which should be allowed.
    const removeUntouched = await request(app)
      .patch(`/api/organizer/events/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketTiers: [{ id: soldTier.id, name: 'Sold Tier', price: 500, quantity: 20 }] });
    expect(removeUntouched.status).toBe(200);

    // Now try to submit with NEITHER tier (dropping the sold one too) — should fail.
    const removeSold = await request(app)
      .patch(`/api/organizer/events/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketTiers: [{ name: 'Replacement Tier', price: 100, quantity: 5 }] });
    expect(removeSold.status).toBe(400);
    expect(removeSold.body.error).toMatch(/cannot remove "sold tier"/i);
  });

  it('PATCH lets an unverified organizer publish a paid draft, but not one whose vendor Cashfree has blocked', async () => {
    const unverifiedOrg = await Organizer.create({
      name: `Unverified Patch Org ${suffix}`,
      slug: `unverified-patch-org-${suffix}`,
    });
    const unverifiedUser = await User.create({
      organizerId: unverifiedOrg.id,
      email: `unverified-patch-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    const unverifiedToken = signAccessToken({ sub: unverifiedUser.id, role: unverifiedUser.role, organizerId: unverifiedOrg.id });

    const createDraft = (title: string) =>
      request(app)
        .post('/api/organizer/events')
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .send({
          title,
          startDate: '2026-12-15',
          startTime: '09:00',
          ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
          status: 'draft',
        });

    // Not verified yet: allowed — payments go to the platform account.
    const draftRes = await createDraft(`Unverified Draft ${suffix}`);
    const publishRes = await request(app)
      .patch(`/api/organizer/events/${draftRes.body.id}`)
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send({ status: 'published' });
    expect(publishRes.status).toBe(200);

    // Blocked by Cashfree: still refused.
    await unverifiedOrg.update({ cashfreeVendorId: `blocked_patch_${suffix}`, cashfreeVendorStatus: 'blocked' });
    const blockedDraft = await createDraft(`Blocked Draft ${suffix}`);
    const blockedRes = await request(app)
      .patch(`/api/organizer/events/${blockedDraft.body.id}`)
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send({ status: 'published' });
    expect(blockedRes.status).toBe(400);
    expect(blockedRes.body.error).toMatch(/blocked/i);

    await Event.destroy({ where: { organizerId: unverifiedOrg.id } });
    await User.destroy({ where: { organizerId: unverifiedOrg.id } });
    await Organizer.destroy({ where: { id: unverifiedOrg.id } });
  });

  it('DELETE removes an event with no bookings, but refuses one that has real bookings', async () => {
    const deletable = await createTestEvent();
    const deleteRes = await request(app).delete(`/api/organizer/events/${deletable.id}`).set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);
    const afterDelete = await request(app).get(`/api/organizer/events/${deletable.id}`).set('Authorization', `Bearer ${token}`);
    expect(afterDelete.status).toBe(404);

    const withBooking = await createTestEvent({ status: 'published' });
    const tierRes = await request(app).get(`/api/organizer/events/${withBooking.id}`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/api/events/${withBooking.id}/bookings`).send({
      ticketCategoryId: tierRes.body.ticketTiers[0].id,
      quantity: 1,
      primaryContactName: 'Delete Guard Customer',
      primaryContactWhatsapp: '+919000000004',
      primaryContactEmail: `delete-guard-${suffix}@example.com`,
      paymentMethod: 'cash',
    });

    const blockedDelete = await request(app).delete(`/api/organizer/events/${withBooking.id}`).set('Authorization', `Bearer ${token}`);
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body.error).toMatch(/1 booking/i);
  });

  it('DELETE refuses to delete another organizer\'s event', async () => {
    const created = await createTestEvent();
    const res = await request(app).delete(`/api/organizer/events/${created.id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});
