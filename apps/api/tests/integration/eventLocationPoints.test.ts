import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User, Event, TicketCategory } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';

describe('event map points: venue + group pickup points (real DB)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;

  const points = [
    { type: 'pickup', label: 'Swargate Bus Stand', address: 'Swargate, Pune', latitude: 18.5018, longitude: 73.8636, time: '04:30', note: 'Near the ticket counter' },
    { type: 'pickup', label: 'Katraj Chowk', address: null, latitude: 18.4575, longitude: 73.8678, time: '05:00', note: null },
    { type: 'venue', label: 'Rajgad Base Village', address: 'Gunjawane', latitude: 18.2546, longitude: 73.6821, time: null, note: 'Parking at the school ground' },
  ];

  beforeAll(async () => {
    const org = await Organizer.create({
      name: `Map Org ${suffix}`, slug: `map-org-${suffix}`, cashfreeVendorId: `map_vendor_${suffix}`, cashfreeVendorStatus: 'active',
    });
    organizerId = org.id;
    const user = await User.create({
      organizerId, email: `map-${suffix}@example.com`, passwordHash: await hashPassword('TestPassword123'), role: 'organizer_owner', emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: 'organizer_owner', organizerId });
  });

  afterAll(async () => {
    const events = await Event.findAll({ where: { organizerId } });
    await TicketCategory.destroy({ where: { eventId: events.map((e) => e.id) } });
    await Event.destroy({ where: { organizerId } });
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  async function create(extra: Record<string, unknown>) {
    return request(app).post('/api/organizer/events').set('Authorization', `Bearer ${token}`).send({
      title: `Map Event ${Math.random()}`, startDate: '2027-01-10', startTime: '06:00',
      ticketTiers: [{ name: 'General', price: 500, quantity: 20 }], status: 'published',
      venueName: 'Rajgad Base Village', venueLatitude: 18.2546, venueLongitude: 73.6821,
      ...extra,
    });
  }

  it('saves the venue coordinates and every pickup point, in order, and shows them on the public page', async () => {
    const res = await create({ locationPoints: points });
    expect(res.status).toBe(201);

    const organizerView = await request(app).get(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(organizerView.body.locationPoints).toEqual(points);
    expect(Number(organizerView.body.venueLatitude)).toBeCloseTo(18.2546);

    const publicView = await request(app).get(`/api/events/${res.body.id}`);
    expect(publicView.body.locationPoints.map((p: { label: string }) => p.label)).toEqual(['Swargate Bus Stand', 'Katraj Chowk', 'Rajgad Base Village']);
    expect(publicView.body.venueMapUrl).toContain('18.2546');
  });

  it('edits replace the points; an empty list clears them', async () => {
    const res = await create({ locationPoints: points });
    await request(app).patch(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`).send({ locationPoints: [points[2]] });
    let view = await request(app).get(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(view.body.locationPoints).toEqual([points[2]]);

    await request(app).patch(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`).send({ locationPoints: [] });
    view = await request(app).get(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(view.body.locationPoints).toBeNull();
  });

  it('rejects a point with invalid coordinates instead of silently dropping it', async () => {
    const res = await create({ locationPoints: [{ ...points[0], latitude: 123 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Map point 1 has an invalid location/);
  });

  it('normalizes unknown types and bad times', async () => {
    const res = await create({ locationPoints: [{ ...points[0], type: 'teleporter', time: '25:99' }] });
    const view = await request(app).get(`/api/organizer/events/${res.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(view.body.locationPoints[0]).toMatchObject({ type: 'pickup', time: null });
  });

  describe('reverse geocoding (Nominatim mocked)', () => {
    let fetchSpy: jest.SpyInstance;
    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
    });
    afterEach(() => fetchSpy.mockRestore());

    it('returns the real address at a clicked point', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          display_name: 'Swargate, Pune, Maharashtra, 411042, India',
          address: { road: 'Shankarshet Road', city: 'Pune', state: 'Maharashtra', postcode: '411042' },
        }),
      } as Response);
      const res = await request(app).get('/api/organizer/venue-reverse?lat=18.5018&lng=73.8636').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.result).toMatchObject({ venueName: 'Shankarshet Road', city: 'Pune', pincode: '411042', latitude: 18.5018 });
      expect(String(fetchSpy.mock.calls[0][0])).toContain('reverse?lat=18.5018&lon=73.8636');
    });

    it('returns null where OpenStreetMap has no address, and 400 for bad coordinates', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ error: 'Unable to geocode' }) } as Response);
      const none = await request(app).get('/api/organizer/venue-reverse?lat=10&lng=70').set('Authorization', `Bearer ${token}`);
      expect(none.body.result).toBeNull();

      const bad = await request(app).get('/api/organizer/venue-reverse?lat=abc&lng=70').set('Authorization', `Bearer ${token}`);
      expect(bad.status).toBe(400);
    });
  });
});
