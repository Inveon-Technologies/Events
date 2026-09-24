import request from 'supertest';
import { createApp } from '../../src/app';
import { sequelize } from '../../src/db/connection';
import { Organizer, User } from '../../src/models';
import { hashPassword } from '../../src/auth/password';
import { signAccessToken } from '../../src/auth/jwt';
import { searchVenues, VenueSearchError } from '../../src/services/venueSearch';

describe('real venue search (Nominatim HTTP call mocked)', () => {
  const app = createApp();
  const suffix = Date.now();
  let organizerId: string;
  let token: string;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    const organizer = await Organizer.create({ name: `Venue Search Test Org ${suffix}`, slug: `venue-search-test-org-${suffix}` });
    organizerId = organizer.id;
    const user = await User.create({
      organizerId,
      email: `venue-search-owner-${suffix}@example.com`,
      passwordHash: await hashPassword('TestPassword123'),
      role: 'organizer_owner',
      emailVerified: true,
    });
    token = signAccessToken({ sub: user.id, role: user.role, organizerId });
  });

  afterAll(async () => {
    await User.destroy({ where: { organizerId } });
    await Organizer.destroy({ where: { id: organizerId } });
    await sequelize.close();
  });

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const realNominatimResponse = [
    {
      display_name: 'Shivaji Nagar, Pune, Maharashtra, 411005, India',
      lat: '18.5308',
      lon: '73.8288',
      address: { road: 'Senapati Bapat Road', city: 'Pune', state: 'Maharashtra', postcode: '411005' },
    },
    {
      display_name: 'Bandra West, Mumbai, Maharashtra, 400050, India',
      lat: '19.0434',
      lon: '72.8197',
      address: { suburb: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', postcode: '400050' },
    },
  ];

  it('returns real results parsed from a real Nominatim response shape, not fabricated coordinates', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => realNominatimResponse } as Response);

    const results = await searchVenues('Pune');
    expect(results).toEqual([
      { displayName: 'Shivaji Nagar, Pune, Maharashtra, 411005, India', venueName: 'Senapati Bapat Road', city: 'Pune', state: 'Maharashtra', pincode: '411005', latitude: 18.5308, longitude: 73.8288 },
      { displayName: 'Bandra West, Mumbai, Maharashtra, 400050, India', venueName: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', pincode: '400050', latitude: 19.0434, longitude: 72.8197 },
    ]);
  });

  it('calls the real Nominatim endpoint with a real identifying User-Agent header, restricted to India', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => [] } as Response);
    await searchVenues('Rajgad Fort');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('nominatim.openstreetmap.org/search');
    expect(String(url)).toContain('countrycodes=in');
    expect((options as RequestInit).headers).toMatchObject({ 'User-Agent': expect.stringContaining('InveonEvents') });
  });

  it('never calls the real search API for a query under 3 characters — returns empty immediately', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => [] } as Response);
    const results = await searchVenues('Pu');
    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws a real, clear error when the search service is unreachable, never silently falling back to fake data', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(searchVenues('Pune')).rejects.toThrow(VenueSearchError);
  });

  it('throws when Nominatim itself returns a non-ok response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    await expect(searchVenues('Pune')).rejects.toThrow(VenueSearchError);
  });

  it('GET /organizer/venue-search returns real results over real HTTP', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => realNominatimResponse } as Response);
    const res = await request(app).get('/api/organizer/venue-search').query({ q: 'Pune' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].latitude).toBe(18.5308);
  });

  it('GET /organizer/venue-search returns a clear 502 when the search service fails, not a generic 500', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    const res = await request(app).get('/api/organizer/venue-search').query({ q: 'Pune' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(502);
  });
});
