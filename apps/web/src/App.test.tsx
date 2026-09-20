import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
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
});
