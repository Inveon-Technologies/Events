import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

const mockCashfreeCheckout = vi.fn();
vi.mock('@cashfreepayments/cashfree-js', () => ({
  load: vi.fn(async () => ({ checkout: mockCashfreeCheckout })),
}));

function renderApp(initialPath = '/', state?: unknown) {
  const queryClient = new QueryClient();
  const entry = state ? { pathname: initialPath, state } : initialPath;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App routing', () => {
  it('renders the home page hero at /', () => {
    renderApp('/');
    expect(screen.getByText(/Discover\. Book\./i)).toBeInTheDocument();
  });

  it('shows the real fetched event data, not the mock catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        organizerName: 'Live Real Test Org',
        counts: { all: 1, draft: 0, published: 1, completed: 0, cancelled: 0 },
        events: [
          {
            id: 'evt-live-1',
            slug: 'live-real-test-event',
            name: 'Live Real Test Event',
            eventDate: '2026-11-01T10:00:00.000Z',
            venueAddress: 'Pune',
            bannerUrl: null,
            organizerName: 'Live Real Test Org',
            organizerSlug: 'live-real-test-org',
            minPricePaise: 30000,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/');
    // The mock catalog's flagship event is "Rajgad Sunrise Trek" from
    // rajgadTrek.ts's discoverEvents array — if that's what's showing on
    // initial render, the real fetch never took over. It only ever
    // appears now if the real API happens to return an event with that
    // exact name, which this mock response deliberately doesn't.
    await waitFor(() => expect(screen.getByText('Live Real Test Event')).toBeInTheDocument());
    expect(screen.getByText(/live real test org/i)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('the organizer profile page shows the real fetched organizer, not the old hardcoded "Example Adventures"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        slug: 'real-verified-org',
        name: 'Real Verified Org',
        logoUrl: null,
        about: 'A genuinely real organizer bio',
        contactEmail: 'hello@realverifiedorg.example',
        events: [
          {
            id: 'evt-org-1',
            slug: 'real-org-event',
            name: 'Real Org Event',
            tagline: null,
            eventDate: '2026-11-15T09:00:00.000Z',
            venueAddress: 'Mumbai',
            bannerUrl: null,
            minPricePaise: 40000,
          },
        ],
        ratingSummary: { averageRating: 4.5, reviewCount: 2 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/organizers/real-verified-org');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Real Verified Org' })).toBeInTheDocument());
    // The previous version of this page hardcoded "Example Adventures"
    // regardless of which organizer's URL was visited — confirming its
    // absence is the actual regression test here.
    expect(screen.queryByText(/example adventures/i)).not.toBeInTheDocument();
    expect(screen.getByText('Real Org Event')).toBeInTheDocument();
    expect(screen.getAllByText(/hello@realverifiedorg\.example/i).length).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });

  it('a nonexistent organizer shows a clean not-found state, not a crash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Organizer not found' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/organizers/does-not-exist');
    await waitFor(() => expect(screen.getByText(/organizer not found/i)).toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  it('links "Host an Event" to organizer login, not the mock organizer profile page', () => {
    renderApp('/');
    const hostLinks = screen.getAllByRole('link', { name: /host an event/i });
    expect(hostLinks.length).toBeGreaterThan(0);
    for (const link of hostLinks) {
      expect(link).toHaveAttribute('href', '/organizer/login');
    }
  });

  it('an event the API does not know shows the unavailable page, never a fabricated mock event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Event not found' }) }));

    renderApp('/events/rajgad-sunrise-trek-2026');
    await waitFor(() => expect(screen.getByText(/Event reference:/i)).toBeInTheDocument());
    expect(screen.queryByText(/Rajgad Sunrise Trek/i)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('a failed event request offers a retry instead of showing mock content', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-retry-1', slug: 'retry-event', name: 'Retry Test Event', tagline: null, description: null,
        eventDate: '2027-01-10T09:00:00.000Z', venueAddress: 'Pune', venueMapUrl: null, bannerUrl: null,
        media: [], organizerName: 'Retry Org', organizerSlug: 'retry-org', scheduleItems: null, packingChecklist: null,
        faqItems: null, ticketCategories: [], ratingSummary: { averageRating: null, reviewCount: 0 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-retry-1');
    await userEvent.setup().click(await screen.findByText('Try again'));
    await waitFor(() => expect(screen.getAllByText('Retry Test Event').length).toBeGreaterThan(0));

    vi.unstubAllGlobals();
  });

  it('event details page shows real uploaded photos and a real video, not the mock gallery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-real-media-1',
        slug: 'real-media-test-event',
        name: 'Real Media Test Event',
        tagline: 'A real tagline',
        description: 'A real description',
        eventDate: '2026-11-20T09:00:00.000Z',
        venueAddress: 'Real Venue, Pune',
        venueMapUrl: null,
        bannerUrl: null,
        termsAndConditions: null,
        cancellationPolicy: null,
        scheduleItems: null,
        packingChecklist: null,
        faqItems: null,
        media: [
          { id: 'media-photo-1', mediaType: 'photo', url: '/api/uploads/events/evt-real-media-1/real-photo.jpg' },
          { id: 'media-video-1', mediaType: 'video', url: '/api/uploads/events/evt-real-media-1/real-video.mp4' },
        ],
        organizerName: 'Real Media Test Org',
        organizerSlug: 'real-media-test-org',
        ticketCategories: [
          { id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-real-media-1');
    await waitFor(() => expect(screen.getAllByText('Real Media Test Event').length).toBeGreaterThan(0));

    // The real uploaded photo should be showing as the hero image — not
    // any of the mock catalog's stock photo URLs.
    const heroImage = document.querySelector('img[src="/api/uploads/events/evt-real-media-1/real-photo.jpg"]');
    expect(heroImage).toBeTruthy();

    // A real <video> element with the real uploaded video's URL.
    const video = document.querySelector('video[src="/api/uploads/events/evt-real-media-1/real-video.mp4"]');
    expect(video).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it('event details page shows no stock gallery photos or video element when a real event has no uploaded media', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-no-media-1',
        slug: 'no-media-test-event',
        name: 'No Media Test Event',
        tagline: null,
        description: null,
        eventDate: '2026-11-25T09:00:00.000Z',
        venueAddress: 'Some Venue',
        venueMapUrl: null,
        bannerUrl: null,
        termsAndConditions: null,
        cancellationPolicy: null,
        scheduleItems: null,
        packingChecklist: null,
        faqItems: null,
        media: [],
        organizerName: 'No Media Test Org',
        organizerSlug: 'no-media-test-org',
        ticketCategories: [
          { id: 'tier-1', name: 'General', description: null, pricePaise: 20000, maxPerBooking: 10, available: 5 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-no-media-1');
    await waitFor(() => expect(screen.getAllByText('No Media Test Event').length).toBeGreaterThan(0));

    // No stock photos standing in for the organizer's own.
    expect(document.querySelector('img[src*="unsplash"], img[alt*="Rajgad"], img[alt*="trek" i]')).toBeNull();
    // No fabricated trek leader, organizer stats, or directions.
    expect(screen.queryByText(/Example Adventures|99\.2%|Nasrapur/)).not.toBeInTheDocument();

    // No video element should render at all when the event has none.
    expect(document.querySelector('video')).toBeNull();

    vi.unstubAllGlobals();
  });

  it('event details page renders real schedule, packing checklist, and FAQ content across their tabs', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-rich-content-1',
        slug: 'rich-content-test-event',
        name: 'Rich Content Test Event',
        tagline: null,
        description: 'A real description',
        eventDate: '2026-12-01T06:00:00.000Z',
        venueAddress: 'Real Venue',
        venueMapUrl: null,
        bannerUrl: null,
        termsAndConditions: null,
        cancellationPolicy: 'Full refund up to 7 days before the event, no refund after.',
        scheduleItems: [
          { time: '06:00 AM', title: 'Assembly', description: 'Meet at the gate' },
          { time: '07:00 AM', title: 'Trek begins' },
        ],
        packingChecklist: [
          { item: 'Trekking shoes', mandatory: true },
          { item: 'Sunscreen', mandatory: false },
        ],
        faqItems: [{ question: 'Is food included?', answer: 'Yes, breakfast is included.' }],
        media: [],
        organizerName: 'Rich Content Test Org',
        organizerSlug: 'rich-content-test-org',
        ticketCategories: [
          { id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-rich-content-1');
    await waitFor(() => expect(screen.getAllByText('Rich Content Test Event').length).toBeGreaterThan(0));

    // "Event Details" tab — real schedule, not the mock template's.
    await user.click(screen.getByRole('button', { name: 'Event Details' }));
    expect(screen.getByText('Assembly')).toBeInTheDocument();
    expect(screen.getByText('Meet at the gate')).toBeInTheDocument();
    expect(screen.getByText('Trek begins')).toBeInTheDocument();

    // "What to Bring" tab — real packing checklist.
    await user.click(screen.getByRole('button', { name: 'What to Bring' }));
    expect(screen.getByText('Trekking shoes')).toBeInTheDocument();
    expect(screen.getByText('Sunscreen')).toBeInTheDocument();
    expect(screen.getByText('Mandatory')).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();

    // "Policy & FAQ" tab — real cancellation text, not the hardcoded
    // fake bullet list, plus a real FAQ entry.
    await user.click(screen.getByRole('button', { name: 'Policy & FAQ' }));
    expect(screen.getByText('Full refund up to 7 days before the event, no refund after.')).toBeInTheDocument();
    expect(screen.queryByText(/Full 100% Refund:/)).not.toBeInTheDocument();
    expect(screen.getByText('Is food included?')).toBeInTheDocument();
    expect(screen.getByText('Yes, breakfast is included.')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('a "No Refund" event shows a clear real notice near the Book Now button and in the Policy tab, never the old fake refund tiers', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-norefund-1',
        slug: 'no-refund-event',
        name: 'No Refund Test Event',
        tagline: null,
        description: 'An event with no refund policy',
        eventDate: '2026-12-25T09:00:00.000Z',
        venueAddress: 'Pune',
        venueMapUrl: null,
        bannerUrl: null,
        termsAndConditions: null,
        cancellationPolicy: null,
        allowSelfServiceCancellation: false,
        refundCutoffDays: null,
        refundPercentage: null,
        scheduleItems: null,
        packingChecklist: null,
        faqItems: null,
        media: [],
        organizerName: 'No Refund Org',
        organizerSlug: 'no-refund-org',
        ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-norefund-1');
    await waitFor(() => expect(screen.getAllByText('No Refund Test Event').length).toBeGreaterThan(0));

    // Prominent notice near the booking CTA, not buried in a tab.
    expect(screen.getByText(/No Refund Policy — this event does not offer cancellations or refunds\./)).toBeInTheDocument();

    // Policy tab shows the real, accurate "No Refund" state, never the
    // old fake hardcoded "Full 100% Refund... 50% Refund..." tiers that
    // used to show for any event with no free-text policy written.
    await user.click(screen.getByRole('button', { name: 'Policy & FAQ' }));
    expect(screen.getByText('No Refund Policy')).toBeInTheDocument();
    expect(screen.getByText(/does not offer self-service cancellations or refunds/)).toBeInTheDocument();
    expect(screen.queryByText(/Full 100% Refund:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/50% Refund:/)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('an event with real self-service cancellation enabled shows its real percentage and cutoff, not a fake fixed policy', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-refundable-1',
        slug: 'refundable-event',
        name: 'Refundable Test Event',
        tagline: null,
        description: 'An event with a real refund policy',
        eventDate: '2026-12-25T09:00:00.000Z',
        venueAddress: 'Pune',
        venueMapUrl: null,
        bannerUrl: null,
        termsAndConditions: null,
        cancellationPolicy: null,
        allowSelfServiceCancellation: true,
        refundCutoffDays: 5,
        refundPercentage: 75,
        scheduleItems: null,
        packingChecklist: null,
        faqItems: null,
        media: [],
        organizerName: 'Refundable Org',
        organizerSlug: 'refundable-org',
        ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-refundable-1');
    await waitFor(() => expect(screen.getAllByText('Refundable Test Event').length).toBeGreaterThan(0));

    expect(screen.queryByText(/No Refund Policy/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Policy & FAQ' }));
    expect(screen.getByText(/75% Refund:/)).toBeInTheDocument();
    expect(screen.getByText(/up to 5 days before the event/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('event details page shows the real rating summary and real reviews, with a "Rate this event" link only for past events', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/reviews')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            reviews: [
              { id: 'rev-1', rating: 5, reviewText: 'Fantastic trip!', customerName: 'Happy C.', createdAt: '2026-01-05T00:00:00.000Z' },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'evt-past-1',
          slug: 'past-review-event',
          name: 'Past Review Event',
          tagline: null,
          description: 'A completed event',
          eventDate: '2026-01-01T09:00:00.000Z', // in the past relative to the fixed test date
          venueAddress: 'Pune',
          venueMapUrl: null,
          bannerUrl: null,
          termsAndConditions: null,
          cancellationPolicy: null,
          scheduleItems: null,
          packingChecklist: null,
          faqItems: null,
          media: [],
          organizerName: 'Past Event Org',
          organizerSlug: 'past-event-org',
          ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
          ratingSummary: { averageRating: 5, reviewCount: 1 },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-past-1');
    await waitFor(() => expect(screen.getAllByText('Past Review Event').length).toBeGreaterThan(0));

    // Real aggregate rating badge near the title, not the old hardcoded "4.9 (184 reviews)".
    expect(screen.getByText(/5 \(1 review\)/)).toBeInTheDocument();
    expect(screen.queryByText(/184 reviews/)).not.toBeInTheDocument();

    // Real review content in the always-visible reviews section.
    expect(screen.getByText('Fantastic trip!')).toBeInTheDocument();
    expect(screen.getByText('Happy C.')).toBeInTheDocument();

    // The event is in the past, so a "Rate this event" link should show.
    expect(screen.getByRole('link', { name: /rate this event/i })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('does not show a "Rate this event" link for an upcoming event', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/reviews')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ reviews: [] }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'evt-future-1',
          slug: 'future-review-event',
          name: 'Future Review Event',
          tagline: null,
          description: null,
          eventDate: '2026-12-25T09:00:00.000Z', // in the future relative to the fixed test date
          venueAddress: 'Pune',
          venueMapUrl: null,
          bannerUrl: null,
          termsAndConditions: null,
          cancellationPolicy: null,
          scheduleItems: null,
          packingChecklist: null,
          faqItems: null,
          media: [],
          organizerName: 'Future Event Org',
          organizerSlug: 'future-event-org',
          ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
          ratingSummary: { averageRating: null, reviewCount: 0 },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-future-1');
    await waitFor(() => expect(screen.getAllByText('Future Review Event').length).toBeGreaterThan(0));

    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /rate this event/i })).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('feedback page submits a real request with the entered rating and shows a success state', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'review-1', rating: 4, reviewText: 'Great time!' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/feedback');

    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-99999');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'customer@example.com');
    await user.click(screen.getAllByRole('radio', { name: '4 stars' })[0]);
    await user.type(screen.getByPlaceholderText(/tell other travellers/i), 'Great time!');
    await user.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => expect(screen.getByText(/thanks for your feedback/i)).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings/INV-BKG-2026-99999/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'customer@example.com', rating: 4, reviewText: 'Great time!' }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('feedback page shows the real server error when the booking/email do not match', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Booking not found' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/feedback');

    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-00000');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'wrong@example.com');
    await user.click(screen.getAllByRole('radio', { name: '3 stars' })[0]);
    await user.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => expect(screen.getByText('Booking not found')).toBeInTheDocument());
    expect(screen.queryByText(/thanks for your feedback/i)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('feedback page requires a star rating before submitting', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/feedback');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-11111');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /submit feedback/i }));

    expect(screen.getByText(/select a star rating/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('falls back to the catch-all route for an unknown path', () => {
    renderApp('/this-route-does-not-exist');
    expect(document.body).toBeTruthy();
  });

  it('renders the organizer login form', () => {
    renderApp('/organizer/login');
    expect(screen.getByRole('heading', { name: /organizer sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor away from the organizer dashboard', () => {
    renderApp('/organizer/dashboard');
    // AppLayout should have redirected to /organizer/login instead.
    expect(screen.getByRole('heading', { name: /organizer sign in/i })).toBeInTheDocument();
  });

  it('checkout hands off to real Cashfree checkout for a paid booking, using the real payment_session_id', async () => {
    const user = userEvent.setup();
    mockCashfreeCheckout.mockResolvedValue({ redirect: true });

    const fetchMock = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/bookings')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ bookingId: 'booking-1', bookingReference: 'INV-BKG-2026-11111', paymentSessionId: 'session_real_123' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'evt-checkout-1',
          slug: 'checkout-event',
          name: 'Checkout Test Event',
          tagline: null,
          description: null,
          eventDate: '2026-12-25T09:00:00.000Z',
          venueAddress: 'Pune',
          venueMapUrl: null,
          bannerUrl: null,
          termsAndConditions: null,
          cancellationPolicy: null,
          scheduleItems: null,
          packingChecklist: null,
          faqItems: null,
          media: [],
          organizerName: 'Checkout Test Org',
          organizerSlug: 'checkout-test-org',
          ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
          ratingSummary: { averageRating: null, reviewCount: 0 },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-checkout-1/checkout', { quantities: { 'tier-1': 1 } });

    await waitFor(() => expect(screen.getAllByText('Checkout Test Event').length).toBeGreaterThan(0));

    await user.click(screen.getAllByText('CONTINUE TO PARTICIPANTS')[0]);

    await user.type(await screen.findByPlaceholderText('e.g. Rahul Sharma'), 'Test Attendee');
    await user.type(screen.getByPlaceholderText('name@example.com'), 'attendee@example.com');
    await user.type(screen.getByPlaceholderText('9876543210'), '9000000001');

    await user.click(screen.getAllByText('PROCEED TO SECURE PAYMENT')[0]);

    await waitFor(() => expect(mockCashfreeCheckout).toHaveBeenCalledWith({
      paymentSessionId: 'session_real_123',
      redirectTarget: '_self',
    }));

    // Never assumes success just because the booking record was created —
    // the old behavior here showed "Payment successful" immediately,
    // which is exactly what this pass fixed.
    expect(screen.queryByText(/payment successful/i)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('checkout books the ticket type the customer chose, with blank attendee forms and the real event details', async () => {
    const user = userEvent.setup();
    const bookingBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn().mockImplementation((url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/bookings')) {
        bookingBodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ bookingId: 'booking-free-1', bookingReference: 'INV-BKG-2026-ABCD2345' }) });
      }
      if (urlStr.includes('/status')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'confirmed', bookingReference: 'INV-BKG-2026-ABCD2345', eventName: 'Two Tier Event' }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'evt-two-tier', slug: 'two-tier', name: 'Two Tier Event', tagline: null, description: 'Real description.',
          eventDate: '2027-02-14T04:30:00.000Z', venueAddress: 'Real Venue, Nashik', venueMapUrl: null, bannerUrl: null,
          media: [], organizerName: 'Two Tier Org', organizerSlug: 'two-tier-org', scheduleItems: null, packingChecklist: null,
          faqItems: null, allowSelfServiceCancellation: false, refundCutoffDays: null, refundPercentage: null,
          ticketCategories: [
            { id: 'tier-general', name: 'General', description: null, pricePaise: 0, maxPerBooking: 4, available: 50 },
            { id: 'tier-vip', name: 'Backstage', description: null, pricePaise: 0, maxPerBooking: 2, available: 5 },
          ],
          ratingSummary: { averageRating: null, reviewCount: 0 },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-two-tier/checkout');
    await waitFor(() => expect(screen.getAllByText('Two Tier Event').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Real Venue, Nashik/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Rajgad|20 September 2026|₹499/)).not.toBeInTheDocument();

    // Switch from the default (1 General) to 2 Backstage.
    await user.click(screen.getByLabelText('Add one Backstage ticket'));
    await user.click(screen.getByLabelText('Add one Backstage ticket'));
    // Backstage allows at most 2 per booking.
    await user.click(screen.getByLabelText('Add one Backstage ticket'));

    await user.click(screen.getAllByText('CONTINUE TO PARTICIPANTS')[0]);
    const nameInputs = await screen.findAllByPlaceholderText('e.g. Rahul Sharma');
    expect(nameInputs).toHaveLength(2);
    nameInputs.forEach((input) => expect(input).toHaveValue(''));

    await user.type(nameInputs[0], 'Asha');
    await user.type(nameInputs[1], 'Ravi');
    await user.type(screen.getAllByPlaceholderText('name@example.com')[0], 'asha@example.com');
    await user.type(screen.getAllByPlaceholderText('9876543210')[0], '9000000001');
    await user.click(screen.getAllByText('PROCEED TO SECURE PAYMENT')[0]);

    await waitFor(() => expect(bookingBodies).toHaveLength(1));
    expect(bookingBodies[0]).toMatchObject({ ticketCategoryId: 'tier-vip', quantity: 2, attendeeNames: ['Asha', 'Ravi'] });
    // Lands on the real confirmation page, which reads the server's status.
    await waitFor(() => expect(screen.getByText('INV-BKG-2026-ABCD2345')).toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  it('checkout shows a real, accurate refund policy trust line — "No Refund" for a non-cancellable event, never the old fake "Free cancellation up to 48 hours"', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/bookings')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ bookingId: 'booking-1', bookingReference: 'INV-BKG-2026-22222' }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'evt-checkout-norefund-1',
          slug: 'checkout-norefund-event',
          name: 'Checkout No Refund Event',
          tagline: null,
          description: null,
          eventDate: '2026-12-25T09:00:00.000Z',
          venueAddress: 'Pune',
          venueMapUrl: null,
          bannerUrl: null,
          termsAndConditions: null,
          cancellationPolicy: null,
          allowSelfServiceCancellation: false,
          refundCutoffDays: null,
          refundPercentage: null,
          scheduleItems: null,
          packingChecklist: null,
          faqItems: null,
          media: [],
          organizerName: 'Checkout No Refund Org',
          organizerSlug: 'checkout-no-refund-org',
          ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
          ratingSummary: { averageRating: null, reviewCount: 0 },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-checkout-norefund-1/checkout', { quantities: { 'tier-1': 1 } });
    await waitFor(() => expect(screen.getAllByText('Checkout No Refund Event').length).toBeGreaterThan(0));

    expect(screen.getByText(/No Refund Policy — this booking cannot be cancelled/)).toBeInTheDocument();
    expect(screen.queryByText(/Free cancellation up to 48 hours/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SMS and WhatsApp ticket dispatched/)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('event page shows a real gender-restriction badge when the event has one, and shows none for an unrestricted event', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-gender-badge-1',
        slug: 'gender-badge-event',
        name: 'Gender Badge Event',
        tagline: null,
        description: null,
        eventDate: '2026-12-25T09:00:00.000Z',
        venueAddress: 'Pune',
        venueMapUrl: null,
        bannerUrl: null,
        termsAndConditions: null,
        cancellationPolicy: null,
        allowSelfServiceCancellation: false,
        refundCutoffDays: null,
        refundPercentage: null,
        genderRestriction: 'female',
        scheduleItems: null,
        packingChecklist: null,
        faqItems: null,
        media: [],
        organizerName: 'Gender Badge Org',
        organizerSlug: 'gender-badge-org',
        ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
        ratingSummary: { averageRating: null, reviewCount: 0 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-gender-badge-1');
    await waitFor(() => expect(screen.getAllByText('Gender Badge Event').length).toBeGreaterThan(0));
    expect(screen.getByText(/female attendees only/i)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('checkout requires a real gender confirmation for a restricted event, blocks submission until confirmed, and sends the real attendeeGenders once confirmed', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/bookings')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ bookingId: 'booking-1', bookingReference: 'INV-BKG-2026-33333', paymentSessionId: 'session_gender_123' }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'evt-checkout-gender-1',
          slug: 'checkout-gender-event',
          name: 'Checkout Gender Event',
          tagline: null,
          description: null,
          eventDate: '2026-12-25T09:00:00.000Z',
          venueAddress: 'Pune',
          venueMapUrl: null,
          bannerUrl: null,
          termsAndConditions: null,
          cancellationPolicy: null,
          allowSelfServiceCancellation: false,
          refundCutoffDays: null,
          refundPercentage: null,
          genderRestriction: 'male',
          scheduleItems: null,
          packingChecklist: null,
          faqItems: null,
          media: [],
          organizerName: 'Checkout Gender Org',
          organizerSlug: 'checkout-gender-org',
          ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
          ratingSummary: { averageRating: null, reviewCount: 0 },
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    mockCashfreeCheckout.mockResolvedValue({ redirect: true });

    renderApp('/events/evt-checkout-gender-1/checkout', { quantities: { 'tier-1': 1 } });
    await waitFor(() => expect(screen.getAllByText('Checkout Gender Event').length).toBeGreaterThan(0));
    await user.click(screen.getAllByText('CONTINUE TO PARTICIPANTS')[0]);

    await user.type(await screen.findByPlaceholderText('e.g. Rahul Sharma'), 'Test Attendee');
    await user.type(screen.getByPlaceholderText('name@example.com'), 'attendee@example.com');
    await user.type(screen.getByPlaceholderText('9876543210'), '9000000001');

    // Real confirmation checkbox for the real restriction — present and unchecked by default.
    const confirmCheckbox = screen.getByRole('checkbox', { name: /confirm this attendee is male/i });
    expect(confirmCheckbox).not.toBeChecked();

    // Submitting without confirming never calls the real booking endpoint.
    await user.click(screen.getAllByText('PROCEED TO SECURE PAYMENT')[0]);
    await new Promise((r) => { setTimeout(r, 50); });
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/bookings'))).toBe(false);

    await user.click(confirmCheckbox);
    expect(confirmCheckbox).toBeChecked();
    await user.click(screen.getAllByText('PROCEED TO SECURE PAYMENT')[0]);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/bookings'));
      expect(call).toBeTruthy();
    });
    const [, bookingOpts] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/bookings'));
    expect(JSON.parse(bookingOpts.body).attendeeGenders).toEqual(['male']);

    vi.unstubAllGlobals();
  });

  it('checkout shows no gender confirmation at all for an unrestricted event', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-checkout-open-1',
        slug: 'checkout-open-event',
        name: 'Checkout Open Event',
        tagline: null,
        description: null,
        eventDate: '2026-12-25T09:00:00.000Z',
        venueAddress: 'Pune',
        venueMapUrl: null,
        bannerUrl: null,
        termsAndConditions: null,
        cancellationPolicy: null,
        allowSelfServiceCancellation: false,
        refundCutoffDays: null,
        refundPercentage: null,
        genderRestriction: null,
        scheduleItems: null,
        packingChecklist: null,
        faqItems: null,
        media: [],
        organizerName: 'Checkout Open Org',
        organizerSlug: 'checkout-open-org',
        ticketCategories: [{ id: 'tier-1', name: 'General', description: null, pricePaise: 50000, maxPerBooking: 10, available: 20 }],
        ratingSummary: { averageRating: null, reviewCount: 0 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/events/evt-checkout-open-1/checkout', { quantities: { 'tier-1': 1 } });
    await waitFor(() => expect(screen.getAllByText('Checkout Open Event').length).toBeGreaterThan(0));
    expect(screen.queryByText(/confirm this attendee is/i)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('booking confirmation page fetches the real status and shows "Confirmed" only when the server says so', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'confirmed', bookingReference: 'INV-BKG-2026-22222', eventName: 'Confirmed Test Event' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/booking-confirmed-1/confirmed');

    await waitFor(() => expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument());
    expect(screen.getByText('Confirmed Test Event')).toBeInTheDocument();
    expect(screen.getByText('INV-BKG-2026-22222')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('booking confirmation page shows a real "still confirming" state for a pending payment, not a false success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'pending', bookingReference: 'INV-BKG-2026-33333', eventName: 'Pending Test Event' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/booking-pending-1/confirmed');

    await waitFor(() => expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument());
    expect(screen.queryByText('Booking Confirmed!')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('booking confirmation page redirects to the payment-failed page for a cancelled/failed payment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'cancelled', bookingReference: 'INV-BKG-2026-44444', eventName: 'Failed Test Event' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/booking-failed-1/confirmed');

    await waitFor(() => expect(screen.getByText(/payment could not be completed/i)).toBeInTheDocument());
    expect(screen.queryByText('Booking Confirmed!')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('a bare /bookings/<reference> link goes to the real, email-verified manage page — never a mock "Paid" booking', async () => {
    renderApp('/bookings/INV-BKG-2026-ABCDEFGH');
    expect(screen.getByRole('heading', { name: /manage your booking/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Paid$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rajgad/i)).not.toBeInTheDocument();
  });

  it('ManageBookingPage requires booking reference + email before showing anything real', async () => {
    renderApp('/bookings/some-id/manage');
    expect(screen.getByRole('heading', { name: /manage your booking/i })).toBeInTheDocument();
    expect(screen.queryByText(/issued attendee/i)).not.toBeInTheDocument();
  });

  it('ManageBookingPage shows real ticket cards and opens a real QR pass modal, with no cancel option when the event does not allow self-service cancellation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bookingReference: 'INV-BKG-2026-77777',
        bookingStatus: 'confirmed',
        bookedAt: '2026-12-01T10:00:00.000Z',
        eventName: 'Manage Test Event',
        eventTagline: null,
        eventDate: '2026-12-25T09:00:00.000Z',
        gateOpenTime: null,
        venueAddress: null,
        venueMapUrl: null,
        bannerUrl: null,
        organizerName: 'Manage Test Org',
        organizerContactEmail: null,
        organizerContactPhone: null,
        packingChecklist: null,
        cancellationPolicyText: null,
        primaryContactName: 'Real Manage Attendee',
        primaryContactEmail: 'attendee@example.com',
        primaryContactWhatsapp: '+919000000001',
        totalAmountPaise: 50000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        paymentReference: null,
        tierBreakdown: [{ tierName: 'General', quantity: 1, unitPricePaise: 50000, subtotalPaise: 50000 }],
        refundAmountPaise: null,
        refundStatus: null,
        allowSelfServiceCancellation: false,
        refundCutoffDays: null,
        refundPercentage: null,
        refundCutoffPassed: false,
        tickets: [{ id: 'ticket-manage-1', ticketReference: 'INV-BKG-2026-77777-1', attendeeName: 'Real Manage Attendee', tierName: 'General', status: 'valid', checkedInAt: null }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/some-id/manage');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-77777');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'attendee@example.com');
    await user.click(screen.getByRole('button', { name: /view my booking/i }));

    await waitFor(() => expect(screen.getByText('Manage Test Event')).toBeInTheDocument());
    expect(screen.getAllByText('Real Manage Attendee').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /manage ticket cancellation/i })).not.toBeInTheDocument();
    expect(screen.getByText(/No Refund Policy/i)).toBeInTheDocument();

    // The real QR image only appears once the pass modal is actually opened.
    expect(screen.queryByAltText(/qr code for real manage attendee/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /view ticket & qr/i }));
    await waitFor(() => {
      expect(screen.getByAltText(/qr code for real manage attendee/i)).toHaveAttribute(
        'src',
        '/api/bookings/INV-BKG-2026-77777/tickets/ticket-manage-1/qr?email=attendee%40example.com',
      );
    });

    vi.unstubAllGlobals();
  });

  it('ManageBookingPage shows a real cancel option when the event allows self-service cancellation and is within cutoff, and submits a real cancellation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/cancel')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ bookingId: 'b1', refundAmountPaise: 40000, refundStatus: 'SUCCESS' }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          bookingReference: 'INV-BKG-2026-88888',
          bookingStatus: 'confirmed',
          bookedAt: '2026-12-01T10:00:00.000Z',
          eventName: 'Cancellable Event',
          eventTagline: null,
          eventDate: '2026-12-25T09:00:00.000Z',
          gateOpenTime: null,
          venueAddress: null,
          venueMapUrl: null,
          bannerUrl: null,
          organizerName: 'Cancellable Test Org',
          organizerContactEmail: null,
          organizerContactPhone: null,
          packingChecklist: null,
          cancellationPolicyText: null,
          primaryContactName: 'Cancel Test Attendee',
          primaryContactEmail: 'canceller@example.com',
          primaryContactWhatsapp: '+919000000002',
          totalAmountPaise: 50000,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          paymentReference: null,
          tierBreakdown: [{ tierName: 'General', quantity: 1, unitPricePaise: 50000, subtotalPaise: 50000 }],
          refundAmountPaise: null,
          refundStatus: null,
          allowSelfServiceCancellation: true,
          refundCutoffDays: 3,
          refundPercentage: 80,
          refundCutoffPassed: false,
          tickets: [{ id: 'ticket-cancel-1', ticketReference: 'INV-BKG-2026-88888-1', attendeeName: 'Cancel Test Attendee', tierName: 'General', status: 'valid', checkedInAt: null }],
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/some-id/manage');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-88888');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'canceller@example.com');
    await user.click(screen.getByRole('button', { name: /view my booking/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /manage ticket cancellation/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /manage ticket cancellation/i }));
    await user.type(screen.getByRole('textbox'), 'Change of plans');
    await user.click(screen.getByRole('button', { name: /confirm cancellation/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/cancel'));
      expect(call).toBeTruthy();
    });
    const [, cancelOpts] = fetchMock.mock.calls.find(([u]) => String(u).includes('/cancel'));
    const body = JSON.parse(cancelOpts.body);
    expect(body).toEqual({ email: 'canceller@example.com', reason: 'Change of plans' });

    vi.unstubAllGlobals();
  });

  it('ManageBookingPage shows the real organizer, venue, payment breakdown, event info, and a real multi-attendee QR modal with attendee switching', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bookingReference: 'INV-BKG-2026-99999',
        bookingStatus: 'confirmed',
        bookedAt: '2026-12-01T10:00:00.000Z',
        eventName: 'Rich Content Event',
        eventTagline: 'A real tagline',
        eventDate: '2026-12-25T09:00:00.000Z',
        gateOpenTime: '2026-12-25T07:30:00.000Z',
        venueAddress: 'Real Venue, Pune',
        venueMapUrl: 'https://www.google.com/maps/search/?api=1&query=Real+Venue',
        bannerUrl: null,
        organizerName: 'Rich Content Organizer',
        organizerContactEmail: 'organizer@example.com',
        organizerContactPhone: null,
        packingChecklist: [{ item: 'Trek shoes', mandatory: true }, { item: 'Water bottle', mandatory: true }],
        cancellationPolicyText: null,
        primaryContactName: 'Rich Content Customer',
        primaryContactEmail: 'rich-content@example.com',
        primaryContactWhatsapp: '+919876543210',
        totalAmountPaise: 150000,
        paymentMethod: 'online',
        paymentStatus: 'paid',
        paymentReference: 'CF-ORD-99999',
        tierBreakdown: [{ tierName: 'General', quantity: 2, unitPricePaise: 50000, subtotalPaise: 100000 }, { tierName: 'VIP', quantity: 1, unitPricePaise: 50000, subtotalPaise: 50000 }],
        refundAmountPaise: null,
        refundStatus: null,
        allowSelfServiceCancellation: true,
        refundCutoffDays: 3,
        refundPercentage: 80,
        refundCutoffPassed: false,
        tickets: [
          { id: 'ticket-rich-1', ticketReference: 'INV-BKG-2026-99999-1', attendeeName: 'First Attendee', tierName: 'General', status: 'valid', checkedInAt: null },
          { id: 'ticket-rich-2', ticketReference: 'INV-BKG-2026-99999-2', attendeeName: 'Second Attendee', tierName: 'VIP', status: 'valid', checkedInAt: null },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/some-id/manage');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-99999');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'rich-content@example.com');
    await user.click(screen.getByRole('button', { name: /view my booking/i }));

    await waitFor(() => expect(screen.getByText('Rich Content Event')).toBeInTheDocument());
    expect(screen.getAllByText('Rich Content Organizer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Real Venue, Pune').length).toBeGreaterThan(0);
    expect(screen.getByText(/CF-ORD-99999/)).toBeInTheDocument();
    expect(screen.getByText(/Trek shoes, Water bottle/)).toBeInTheDocument();
    // Real masked contact — never the raw registered email/phone shown in full.
    expect(screen.queryByText('rich-content@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('+919876543210')).not.toBeInTheDocument();
    // Real per-tier breakdown, not a flat total only.
    expect(screen.getByText('General × 2')).toBeInTheDocument();
    expect(screen.getByText('VIP × 1')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /view ticket & qr/i })[0]);
    await waitFor(() => expect(screen.getByAltText(/qr code for first attendee/i)).toBeInTheDocument());
    // Real attendee-switcher tab for the second ticket, inside the modal.
    await user.click(screen.getByRole('button', { name: /second \(vip\)/i }));
    await waitFor(() => expect(screen.getByAltText(/qr code for second attendee/i)).toBeInTheDocument());
    // Real download link, pointed at the real per-ticket QR endpoint.
    expect(screen.getByRole('link', { name: /download pass/i })).toHaveAttribute(
      'href',
      '/api/bookings/INV-BKG-2026-99999/tickets/ticket-rich-2/qr?email=rich-content%40example.com',
    );

    vi.unstubAllGlobals();
  });

  it('real customer login: sending the code calls the real initiate endpoint, then real OTP verification stores a real session and lands on the real My Bookings hub', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes('/bookings/login/initiate')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      if (urlStr.includes('/bookings/login/verify')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ token: 'real-session-token' }) });
      }
      if (urlStr.includes('/bookings/my')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({
            bookings: [
              { bookingReference: 'INV-BKG-2026-11111', bookingStatus: 'confirmed', eventId: 'evt-1', eventName: 'Real Hub Event One', eventDate: '2099-12-25T09:00:00.000Z', bannerUrl: null, totalAmountPaise: 50000, ticketCount: 1 },
              { bookingReference: 'INV-BKG-2026-22222', bookingStatus: 'cancelled', eventId: 'evt-2', eventName: 'Real Hub Event Two', eventDate: '2020-01-01T09:00:00.000Z', bannerUrl: null, totalAmountPaise: 100000, ticketCount: 2 },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.removeItem('inveon_customer_session');

    renderApp('/bookings/lookup');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-11111');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'real-customer@example.com');
    await user.click(screen.getByRole('button', { name: /send login code/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/login/initiate'));
      expect(call).toBeTruthy();
    });
    const [, initiateOpts] = fetchMock.mock.calls.find(([u]) => String(u).includes('/login/initiate'));
    expect(JSON.parse(initiateOpts.body)).toEqual({ bookingReference: 'INV-BKG-2026-11111', email: 'real-customer@example.com' });

    // Real 6-box OTP entry — pasted as one atomic clipboard event
    // (matching the real paste handler this page supports for OTP
    // autofill) rather than six separate sequential keystrokes, each
    // of which triggers its own state update and auto-focus side
    // effect; asserting on the fully-settled code this way avoids a
    // real race between those six updates and the click below.
    await waitFor(() => expect(screen.getByText(/Verify Your Identity/i)).toBeInTheDocument());
    const otpInputs = screen.getAllByRole('textbox').filter((el) => el.getAttribute('maxlength') === '1');
    expect(otpInputs).toHaveLength(6);
    fireEvent.paste(otpInputs[0], { clipboardData: { getData: () => '123456' } });
    await user.click(screen.getByRole('button', { name: /verify.*continue/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/login/verify'));
      expect(call).toBeTruthy();
    });
    const [, verifyOpts] = fetchMock.mock.calls.find(([u]) => String(u).includes('/login/verify'));
    expect(JSON.parse(verifyOpts.body)).toEqual({ email: 'real-customer@example.com', code: '123456' });

    // Real navigation to the real hub, real session stored, real bookings shown.
    await waitFor(() => expect(screen.getByText('Real Hub Event One')).toBeInTheDocument());
    expect(screen.getByText('Real Hub Event Two')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('inveon_customer_session')!)).toEqual({ token: 'real-session-token', email: 'real-customer@example.com' });

    // Real status filtering.
    await user.click(screen.getByRole('button', { name: /cancelled/i }));
    expect(screen.queryByText('Real Hub Event One')).not.toBeInTheDocument();
    expect(screen.getByText('Real Hub Event Two')).toBeInTheDocument();

    localStorage.removeItem('inveon_customer_session');
    vi.unstubAllGlobals();
  });

  it('visiting /bookings/my with no real session redirects to the real login page, not a broken/empty hub', async () => {
    localStorage.removeItem('inveon_customer_session');
    renderApp('/bookings/my');
    await waitFor(() => expect(screen.getByText(/Manage Your Booking/i)).toBeInTheDocument());
  });
});
