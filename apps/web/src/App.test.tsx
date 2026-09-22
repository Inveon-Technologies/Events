import { render, screen, waitFor } from '@testing-library/react';
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

  it('renders event details for a known mock event', async () => {
    renderApp('/events/rajgad-sunrise-trek-2026');
    // EventDetailsPage now loads asynchronously (tries the real API first,
    // falls back to the mock template) — wait for it instead of asserting
    // synchronously against the loading spinner.
    await waitFor(() => expect(screen.getAllByText(/Rajgad Sunrise Trek/i).length).toBeGreaterThan(0));
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

  it('event details page falls back to the mock gallery when a real event has no uploaded photos, and shows no video element at all', async () => {
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

  it('ManageBookingPage requires booking reference + email before showing anything real', async () => {
    renderApp('/bookings/some-id/manage');
    expect(screen.getByRole('heading', { name: /manage your booking/i })).toBeInTheDocument();
    expect(screen.queryByText(/issued attendee/i)).not.toBeInTheDocument();
  });

  it('ManageBookingPage shows real tickets with real QR image URLs once verified, and no cancel option when the event does not allow self-service cancellation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        bookingReference: 'INV-BKG-2026-77777',
        bookingStatus: 'confirmed',
        eventName: 'Manage Test Event',
        eventDate: '2026-12-25T09:00:00.000Z',
        totalAmountPaise: 50000,
        refundAmountPaise: null,
        refundStatus: null,
        allowSelfServiceCancellation: false,
        refundCutoffPassed: false,
        tickets: [{ id: 'ticket-manage-1', attendeeName: 'Real Manage Attendee', tierName: 'General', status: 'valid' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/some-id/manage');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-77777');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'attendee@example.com');
    await user.click(screen.getByRole('button', { name: /view my booking/i }));

    await waitFor(() => expect(screen.getByText('Manage Test Event')).toBeInTheDocument());
    expect(screen.getByText('Real Manage Attendee')).toBeInTheDocument();
    expect(screen.getByAltText(/qr code for real manage attendee/i)).toHaveAttribute(
      'src',
      '/api/bookings/INV-BKG-2026-77777/tickets/ticket-manage-1/qr?email=attendee%40example.com',
    );
    expect(screen.queryByRole('button', { name: /cancel this booking/i })).not.toBeInTheDocument();

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
          eventName: 'Cancellable Event',
          eventDate: '2026-12-25T09:00:00.000Z',
          totalAmountPaise: 50000,
          refundAmountPaise: null,
          refundStatus: null,
          allowSelfServiceCancellation: true,
          refundCutoffPassed: false,
          tickets: [{ id: 'ticket-cancel-1', attendeeName: 'Cancel Test Attendee', tierName: 'General', status: 'valid' }],
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp('/bookings/some-id/manage');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-88888');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'canceller@example.com');
    await user.click(screen.getByRole('button', { name: /view my booking/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /cancel this booking/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /cancel this booking/i }));
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
});
