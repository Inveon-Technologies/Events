import { addressParts, eventJsonLd, istIso, jsonLd, renderShell, truncate } from '../src/services/seo';
import type { PublicEventDetail } from '../src/services/publicEvents';

const event: PublicEventDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'rajgad-sunrise-trek-2026',
  name: 'Rajgad Sunrise Trek',
  tagline: 'Watch the sunrise from Balekilla',
  description: 'A guided night trek to Rajgad fort.',
  eventDate: '2026-11-14T18:30:00.000Z',
  gateOpenTime: null,
  venueAddress: 'Gunjavane Village, Velhe, Pune, Maharashtra, 412213',
  venueLatitude: 18.246,
  venueLongitude: 73.682,
  venueMapUrl: null,
  bannerUrl: '/api/uploads/banner.jpg',
  termsAndConditions: null,
  cancellationPolicy: null,
  allowSelfServiceCancellation: false,
  refundCutoffDays: null,
  refundPercentage: null,
  genderRestriction: null,
  scheduleItems: null,
  packingChecklist: null,
  faqItems: null,
  locationPoints: null,
  media: [{ id: 'm1', mediaType: 'photo', url: 'https://cdn.example.com/p1.jpg' }],
  organizerName: 'Sahyadri Trekkers',
  organizerSlug: 'sahyadri-trekkers',
  organizerLogoUrl: null,
  ticketCategories: [
    { id: 't1', name: 'General', description: null, pricePaise: 149900, maxPerBooking: 10, available: 12 },
    { id: 't2', name: 'With transport', description: null, pricePaise: 249900, maxPerBooking: 4, available: 0 },
  ],
  ratingSummary: { averageRating: null, reviewCount: 0 },
};

describe('seo', () => {
  beforeAll(() => {
    process.env.WEB_PUBLIC_URL = 'https://events.example.in';
  });

  it('splits an Indian address into PostalAddress parts', () => {
    expect(addressParts(event.venueAddress)).toEqual({
      venue: 'Gunjavane Village',
      locality: 'Pune',
      region: 'Maharashtra',
      postalCode: '412213',
      full: 'Gunjavane Village, Velhe, Pune, Maharashtra, 412213',
    });
  });

  it('writes the start time in IST with its offset', () => {
    expect(istIso('2026-11-14T18:30:00.000Z')).toBe('2026-11-15T00:00:00+05:30');
  });

  it('builds a schema.org Event with place, geo, images, organizer and offers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ld = eventJsonLd(event, new Date('2026-10-01T00:00:00Z')) as Record<string, any>;
    expect(ld['@type']).toBe('Event');
    expect(ld.url).toBe('https://events.example.in/events/rajgad-sunrise-trek-2026');
    expect(ld.image).toEqual(['https://events.example.in/api/uploads/banner.jpg', 'https://cdn.example.com/p1.jpg']);
    expect(ld.location.address.addressLocality).toBe('Pune');
    expect(ld.location.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 18.246, longitude: 73.682 });
    expect(ld.organizer.url).toBe('https://events.example.in/organizers/sahyadri-trekkers');
    expect(ld.offers).toHaveLength(2);
    expect(ld.offers[0]).toMatchObject({ price: '1499.00', priceCurrency: 'INR', availability: 'https://schema.org/InStock' });
    expect(ld.offers[1].availability).toBe('https://schema.org/SoldOut');
  });

  it('keeps JSON-LD from closing its script tag', () => {
    expect(jsonLd({ name: '</script><script>alert(1)</script>' })).not.toMatch(/<\/script><script>/);
  });

  it('puts the tags into the SPA shell and fills #root', () => {
    const shell = '<!doctype html><html><head><title>Inveon Events</title></head><body><div id="root"></div></body></html>';
    const html = renderShell(shell, {
      status: 200,
      title: 'Rajgad "Trek"',
      description: 'desc',
      canonical: 'https://events.example.in/events/x',
      image: 'https://events.example.in/a.jpg',
      jsonLd: [{ '@type': 'Event' }],
      bodyHtml: '<h1>Rajgad</h1>',
    });
    expect(html).toContain('<title>Rajgad &quot;Trek&quot;</title>');
    expect(html).not.toContain('<title>Inveon Events</title>');
    expect(html).toContain('<meta property="og:image" content="https://events.example.in/a.jpg" />');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('<div id="root"><h1>Rajgad</h1></div>');
  });

  it('keeps "$" in page text and drops the shell\'s default Open Graph tags', () => {
    const shell =
      '<html><head><title>x</title><meta property="og:type" content="website" /><meta property="og:site_name" content="Inveon Events" /></head><body><div id="root"></div></body></html>';
    const html = renderShell(shell, {
      status: 200,
      title: "Rock $& Roll $' Night",
      description: 'Win $100',
      canonical: 'https://events.example.in/events/x',
      image: null,
      jsonLd: [],
      ogType: 'event',
      bodyHtml: "<h1>Rock $& Roll $' Night</h1>",
    });
    expect(html).toContain("<h1>Rock $& Roll $' Night</h1>");
    expect(html).toContain('Rock $&amp; Roll $&#39; Night');
    expect(html.match(/property="og:type"/g)).toHaveLength(1);
    expect(html).toContain('<meta property="og:type" content="event" />');
    expect(html.match(/property="og:site_name"/g)).toHaveLength(1);
  });

  it('truncates on a word boundary', () => {
    expect(truncate('one two three four five', 12)).toBe('one two…');
  });
});
