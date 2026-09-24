import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderAt(path) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loggedInUser = {
  id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
  token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
};

const eventsResponse = {
  organizerName: 'Session Test Org',
  counts: { all: 1, draft: 0, published: 1, completed: 0, cancelled: 0 },
  events: [
    { id: 'evt-1', eventCode: 'EVT-1', name: 'Only Real Event', eventDate: '2026-12-01T05:00:00.000Z', venueAddress: 'Pune', bannerUrl: null, capacity: 10, ticketsSold: 0, revenuePaise: 0, displayStatus: 'published' },
  ],
};

function booking(i) {
  return {
    id: `b-${i}`, bookingReference: `INV-BKG-2026-${String(i).padStart(8, '0')}`, eventId: 'evt-1', eventName: 'Only Real Event',
    customerName: `Customer ${i}`, customerEmail: `c${i}@example.com`, customerPhone: '9000000000', ticketCount: 1,
    totalAmountPaise: 0, displayStatus: 'confirmed', paymentMethod: 'online', createdAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('organizer portal: session and data handling', () => {
  beforeEach(() => {
    localStorage.setItem('inveon_user', JSON.stringify(loggedInUser));
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('an expired session (401) logs the organizer out and clears their cached data', async () => {
    localStorage.setItem('inveon_participants', JSON.stringify([{ id: 'p1' }]));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) }));

    renderAt('/organizer/events');

    await waitFor(() => expect(screen.getByText('Organizer Sign In')).toBeInTheDocument());
    expect(localStorage.getItem('inveon_user')).toBeNull();
    expect(localStorage.getItem('inveon_participants')).toBeNull();
  });

  it('never caches the organizer\'s real events or bookings in localStorage', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/organizer/bookings')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ bookings: [booking(1)], pagination: { page: 1, pageSize: 100, total: 1 } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => eventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/events');
    await waitFor(() => expect(screen.getAllByText('Only Real Event').length).toBeGreaterThan(0));
    expect(localStorage.getItem('inveon_events')).toBeNull();
    expect(localStorage.getItem('inveon_bookings')).toBeNull();
  });

  it('loads every page of bookings, not just the first 100', async () => {
    const all = Array.from({ length: 150 }, (_, i) => booking(i + 1));
    const bookingUrls = [];
    const fetchMock = vi.fn().mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/organizer/bookings')) {
        bookingUrls.push(u);
        const page = Number(new URL(u, 'http://x').searchParams.get('page'));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ bookings: all.slice((page - 1) * 100, page * 100), pagination: { page, pageSize: 100, total: 150 } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => eventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/bookings');
    await waitFor(() => expect(bookingUrls).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByText(/150/).length).toBeGreaterThan(0));
  });

  it('an unknown event id shows "Event not found" instead of silently opening a different event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => eventsResponse }));

    renderAt('/organizer/events/evt-does-not-exist/dashboard');
    await waitFor(() => expect(screen.getByText('Event not found.')).toBeInTheDocument());
    expect(screen.queryByText('Only Real Event')).not.toBeInTheDocument();
  });
});

describe('organizer portal: real identity in the header', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the organizer\'s uploaded logo and real names — no stock avatar or hardcoded "Eeshan Agrawal"', async () => {
    localStorage.setItem('inveon_user', JSON.stringify({ ...loggedInUser, name: 'Asha Kulkarni', avatar: null }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (String(url).includes('/organizer/profile')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ name: 'Sahyadri Trails', logoUrl: '/api/uploads/organizers/org-1/logo.png' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => eventsResponse });
    }));

    renderAt('/organizer/events');
    await waitFor(() => expect(document.querySelector('img[src="/api/uploads/organizers/org-1/logo.png"]')).toBeTruthy());
    expect(screen.getAllByText('Asha Kulkarni').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Eeshan/)).not.toBeInTheDocument();
    expect(document.querySelector('img[src*="unsplash"]')).toBeNull();
  });
});
