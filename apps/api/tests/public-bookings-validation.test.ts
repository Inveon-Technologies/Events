import request from 'supertest';
import { createApp } from '../src/app';

describe('POST /events/:eventId/bookings — input validation', () => {
  const app = createApp();

  it('rejects a request missing required fields before touching the database', async () => {
    const res = await request(app).post('/events/some-event-id/bookings').send({});
    expect(res.status).toBe(400);
  });

  it('rejects an invalid paymentMethod', async () => {
    const res = await request(app).post('/events/some-event-id/bookings').send({
      ticketCategoryId: 'cat-1',
      quantity: 1,
      primaryContactName: 'Test',
      primaryContactWhatsapp: '+911234567890',
      primaryContactEmail: 'test@example.com',
      paymentMethod: 'bitcoin',
    });
    expect(res.status).toBe(400);
  });
});
