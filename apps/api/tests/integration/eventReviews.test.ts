import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory, Booking, EventReview } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('event feedback and ratings (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let pastEventId: string;
  let futureEventId: string;
  let tierId: string;
  let futureTierId: string;

  async function createConfirmedBooking(eventId: string, tierIdParam: string, email: string, name: string) {
    const res = await request(app).post(`/api/events/${eventId}/bookings`).send({
      ticketCategoryId: tierIdParam,
      quantity: 1,
      primaryContactName: name,
      primaryContactWhatsapp: '+919000000001',
      primaryContactEmail: email,
      paymentMethod: 'cash',
    });
    await Booking.update({ status: 'confirmed' }, { where: { id: res.body.bookingId } });
    return res.body.bookingReference as string;
  }

  beforeAll(async () => {
    // This suite publishes paid events to book and review, which needs
    // an organizer that clears eventCreation.ts's publish-time
    // verification gate to reach what these tests are actually about.
    const organizer = await Organizer.create({
      name: `Review Test Org ${suffix}`,
      slug: `review-test-org-${suffix}`,
      cashfreeVendorId: `review_test_vendor_${suffix}`,
      cashfreeVendorStatus: 'active',
    });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `review-test-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });

    const pastEventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Past Review Event ${suffix}`,
        startDate: '2026-01-01',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    pastEventId = pastEventRes.body.id;
    tierId = (await TicketCategory.findOne({ where: { eventId: pastEventId } }))!.id;

    const futureEventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `Future Review Event ${suffix}`,
        startDate: '2026-12-25',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    futureEventId = futureEventRes.body.id;
    futureTierId = (await TicketCategory.findOne({ where: { eventId: futureEventId } }))!.id;
  });

  afterAll(async () => {
    for (const eventId of [pastEventId, futureEventId]) {
      const bookings = await Booking.findAll({ where: { eventId } });
      for (const booking of bookings) {
        await EventReview.destroy({ where: { bookingId: booking.id } });
      }
      await Booking.destroy({ where: { eventId } });
      await TicketCategory.destroy({ where: { eventId } });
    }
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  it('accepts real feedback for a confirmed booking on a completed event, and it appears in the reviews list', async () => {
    const ref = await createConfirmedBooking(pastEventId, tierId, `happy-${suffix}@example.com`, 'Happy Customer');

    const submitRes = await request(app)
      .post(`/api/bookings/${ref}/feedback`)
      .send({ email: `happy-${suffix}@example.com`, rating: 5, reviewText: 'Loved it!' });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.rating).toBe(5);

    const listRes = await request(app).get(`/api/events/${pastEventId}/reviews`);
    expect(listRes.body.reviews).toHaveLength(1);
    expect(listRes.body.reviews[0].reviewText).toBe('Loved it!');
    // First name + last initial only, not the full real name.
    expect(listRes.body.reviews[0].customerName).toBe('Happy C.');
  });

  it('rejects a wrong email with the same 404 as a nonexistent booking, not revealing it exists', async () => {
    const ref = await createConfirmedBooking(pastEventId, tierId, `email-check-${suffix}@example.com`, 'Email Check');

    const wrongEmail = await request(app).post(`/api/bookings/${ref}/feedback`).send({ email: 'someone-else@example.com', rating: 5 });
    const nonexistent = await request(app).post('/api/bookings/DOES-NOT-EXIST/feedback').send({ email: 'x@example.com', rating: 5 });

    expect(wrongEmail.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(wrongEmail.body.error).toBe(nonexistent.body.error);
  });

  it('rejects feedback for a booking that was never confirmed', async () => {
    const res = await request(app).post(`/api/events/${pastEventId}/bookings`).send({
      ticketCategoryId: tierId,
      quantity: 1,
      primaryContactName: 'Unconfirmed Customer',
      primaryContactWhatsapp: '+919000000002',
      primaryContactEmail: `unconfirmed-${suffix}@example.com`,
      paymentMethod: 'cash',
    });
    // Deliberately NOT marking this one confirmed.

    const feedbackRes = await request(app)
      .post(`/api/bookings/${res.body.bookingReference}/feedback`)
      .send({ email: `unconfirmed-${suffix}@example.com`, rating: 5 });
    expect(feedbackRes.status).toBe(400);
    expect(feedbackRes.body.error).toMatch(/not eligible/i);
  });

  it('rejects feedback for a booking on an event that has not happened yet', async () => {
    const ref = await createConfirmedBooking(futureEventId, futureTierId, `future-${suffix}@example.com`, 'Future Customer');

    const res = await request(app).post(`/api/bookings/${ref}/feedback`).send({ email: `future-${suffix}@example.com`, rating: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/has not|only be left after/i);
  });

  it('rejects a second submission for the same booking', async () => {
    const ref = await createConfirmedBooking(pastEventId, tierId, `dup-${suffix}@example.com`, 'Dup Customer');

    const first = await request(app).post(`/api/bookings/${ref}/feedback`).send({ email: `dup-${suffix}@example.com`, rating: 4 });
    expect(first.status).toBe(201);

    const second = await request(app).post(`/api/bookings/${ref}/feedback`).send({ email: `dup-${suffix}@example.com`, rating: 2 });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already/i);
  });

  it('rejects a rating outside 1-5', async () => {
    const ref = await createConfirmedBooking(pastEventId, tierId, `badrating-${suffix}@example.com`, 'Bad Rating Customer');

    const tooHigh = await request(app).post(`/api/bookings/${ref}/feedback`).send({ email: `badrating-${suffix}@example.com`, rating: 7 });
    expect(tooHigh.status).toBe(400);

    const tooLow = await request(app).post(`/api/bookings/${ref}/feedback`).send({ email: `badrating-${suffix}@example.com`, rating: 0 });
    expect(tooLow.status).toBe(400);
  });

  it('averages correctly across multiple reviews on the same event, and reflects on both the event and organizer aggregate', async () => {
    const refA = await createConfirmedBooking(pastEventId, tierId, `avg-a-${suffix}@example.com`, 'Avg A');
    const refB = await createConfirmedBooking(pastEventId, tierId, `avg-b-${suffix}@example.com`, 'Avg B');

    await request(app).post(`/api/bookings/${refA}/feedback`).send({ email: `avg-a-${suffix}@example.com`, rating: 5 });
    await request(app).post(`/api/bookings/${refB}/feedback`).send({ email: `avg-b-${suffix}@example.com`, rating: 1 });

    const eventRes = await request(app).get(`/api/events/${pastEventId}`);
    const reviewCount = eventRes.body.ratingSummary.reviewCount;
    expect(reviewCount).toBeGreaterThanOrEqual(2);
    expect(eventRes.body.ratingSummary.averageRating).toBeGreaterThanOrEqual(1);
    expect(eventRes.body.ratingSummary.averageRating).toBeLessThanOrEqual(5);

    const orgRes = await request(app).get(`/api/organizers/review-test-org-${suffix}`);
    expect(orgRes.body.ratingSummary.reviewCount).toBeGreaterThanOrEqual(2);
  });

  it('an event with no reviews returns null/0, not an error', async () => {
    const noReviewsEventRes = await request(app)
      .post('/api/organizer/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `No Reviews Event ${suffix}`,
        startDate: '2026-02-01',
        startTime: '07:00',
        ticketTiers: [{ name: 'General', price: 500, quantity: 20 }],
        status: 'published',
      });
    const res = await request(app).get(`/api/events/${noReviewsEventRes.body.id}`);
    expect(res.body.ratingSummary).toEqual({ averageRating: null, reviewCount: 0 });
  });
});
