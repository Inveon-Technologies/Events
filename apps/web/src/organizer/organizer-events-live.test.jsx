import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

// Shaped exactly like the live-verified GET /api/organizer/events response
// (checked by hand against a real running server with real seed data —
// see the Rajgad Sunrise Trek revenue figure below, which matches the
// same seed data used to verify the organizer Events page in an earlier
// pass: revenuePaise 648700 -> grossRevenue 6487).
const realEventsResponse = {
  organizerName: 'Eco Pandhari Club',
  counts: { all: 2, draft: 0, published: 2, completed: 0, cancelled: 0 },
  events: [
    {
      id: 'evt-workshop',
      eventCode: 'EVT-A16F12',
      name: 'Pune Business Workshop',
      eventDate: '2026-10-16T05:29:29.684Z',
      venueAddress: 'Pune',
      bannerUrl: null,
      capacity: 50,
      ticketsSold: 3,
      revenuePaise: 270000,
      displayStatus: 'published',
    },
    {
      id: 'evt-rajgad',
      eventCode: 'EVT-FAE397',
      name: 'Rajgad Sunrise Trek',
      eventDate: '2026-10-09T05:29:29.678Z',
      venueAddress: 'Rajgad Fort, Pune',
      bannerUrl: null,
      capacity: 150,
      ticketsSold: 14,
      revenuePaise: 648700,
      displayStatus: 'published',
    },
  ],
};

function renderAt(path) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('organizer portal: real events data through EventsContext', () => {
  beforeEach(() => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1',
        email: 'owner@ecopandhari.example',
        role: 'organizer_owner',
        organizerId: 'org-1',
        token: 'fake-token',
        name: 'owner',
        orgName: null,
        avatar: 'https://example.com/avatar.png',
        isLoggedIn: true,
      }),
    );
    localStorage.removeItem('inveon_events');
    localStorage.removeItem('inveon_bookings');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('fetches real events and renders them on My Events with correctly mapped fields, not the mock catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => realEventsResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/events');

    // The mock catalog's flagship event is "Sahyadri Monsoon Night Trek &
    // Camp 2025" (see mockEvents.js) — if that's what's showing, the real
    // fetch never took over. Wait for the REAL event to appear instead.
    await waitFor(() => expect(screen.getByText('Rajgad Sunrise Trek')).toBeInTheDocument());
    expect(screen.getByText('Pune Business Workshop')).toBeInTheDocument();
    expect(screen.queryByText(/Sahyadri Monsoon/i)).not.toBeInTheDocument();

    // Real paise-to-rupees conversion, not a placeholder.
    expect(screen.getByText('₹6,487')).toBeInTheDocument();
    expect(screen.getByText('₹2,700')).toBeInTheDocument();

    // Real ticketsSold/capacity, not mock numbers.
    const rajgadCard = screen.getByText('Rajgad Sunrise Trek').closest('div.bg-white, article, li') ?? document.body;
    expect(rajgadCard).toHaveTextContent('14 / 150');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/organizer/events'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }) }),
    );
  });

  it('"Publish Live" on a draft event calls the real PATCH endpoint, not a local state toggle', async () => {
    const user = userEvent.setup();
    const draftEventsResponse = {
      organizerName: 'Eco Pandhari Club',
      counts: { all: 1, draft: 1, published: 0, completed: 0, cancelled: 0 },
      events: [
        {
          id: 'evt-draft-1',
          eventCode: 'EVT-DRAFT1',
          name: 'Draft Event To Publish',
          eventDate: '2026-11-01T09:00:00.000Z',
          venueAddress: 'Pune',
          bannerUrl: null,
          capacity: 20,
          ticketsSold: 0,
          revenuePaise: 0,
          displayStatus: 'draft',
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'evt-draft-1', slug: 'draft-event' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => draftEventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/events');
    await waitFor(() => expect(screen.getByText('Draft Event To Publish')).toBeInTheDocument());

    const card = screen.getByText('Draft Event To Publish').closest('div.group') ?? document.body;
    const menuButton = within(card).getAllByRole('button')[0];
    await user.click(menuButton);
    await user.click(screen.getByText('Publish Live'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => o?.method === 'PATCH' && String(u).includes('evt-draft-1'));
      expect(call).toBeTruthy();
    });
    const [, patchOpts] = fetchMock.mock.calls.find(([u, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patchOpts.body)).toEqual({ status: 'published' });
  });

  it('"Cancel Event" prompts for a reason and calls the real cancel endpoint with it', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Venue became unavailable');
    const publishedEventsResponse = {
      organizerName: 'Eco Pandhari Club',
      counts: { all: 1, draft: 0, published: 1, completed: 0, cancelled: 0 },
      events: [
        {
          id: 'evt-to-cancel-1',
          eventCode: 'EVT-CANCEL1',
          name: 'Event To Cancel',
          eventDate: '2026-11-01T09:00:00.000Z',
          venueAddress: 'Pune',
          bannerUrl: null,
          capacity: 20,
          ticketsSold: 2,
          revenuePaise: 100000,
          displayStatus: 'published',
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/cancel')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ cancelledBookings: [{ bookingId: 'b1' }] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => publishedEventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/events');
    await waitFor(() => expect(screen.getByText('Event To Cancel')).toBeInTheDocument());

    const card = screen.getByText('Event To Cancel').closest('div.group') ?? document.body;
    const menuButton = within(card).getAllByRole('button')[0];
    await user.click(menuButton);
    await user.click(screen.getByText('Cancel Event'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/cancel'));
      expect(call).toBeTruthy();
    });
    const [, cancelOpts] = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/cancel'));
    expect(JSON.parse(cancelOpts.body)).toEqual({ reason: 'Venue became unavailable' });

    promptSpy.mockRestore();
  });
});

describe('organizer portal: real bookings data through EventsContext', () => {
  // Shaped exactly like the live-verified GET /api/organizer/bookings?eventId=all
  // response (hand-checked against a real server with real seed data — 9
  // bookings, including real customerPhone, eventId, and ticketTierNames,
  // none of which existed on this endpoint before this pass).
  const realBookingsResponse = {
    organizerName: 'Eco Pandhari Club',
    event: null,
    organizerEvents: [{ id: 'evt-rajgad', name: 'Rajgad Sunrise Trek' }],
    counts: { all: 2, confirmed: 1, pending: 1, cancelled: 0, partially_cancelled: 0 },
    bookings: [
      {
        id: 'bkg-1',
        bookingReference: 'EPC-2026-84998',
        customerName: 'Divya Iyer',
        customerEmail: 'divya.iyer@example.com',
        customerPhone: '+919012259619',
        eventId: 'evt-rajgad',
        eventName: 'Rajgad Sunrise Trek',
        ticketCount: 2,
        totalAmountPaise: 99800,
        paymentStatus: 'paid',
        displayStatus: 'confirmed',
        ticketTierNames: 'Solo Entry',
        createdAt: '2026-09-15T00:00:00.000Z',
      },
      {
        id: 'bkg-2',
        bookingReference: 'EPC-2026-23569',
        customerName: 'Rahul Sharma',
        customerEmail: 'rahul.sharma@example.com',
        customerPhone: '+919028249850',
        eventId: 'evt-rajgad',
        eventName: 'Rajgad Sunrise Trek',
        ticketCount: 4,
        totalAmountPaise: 199600,
        paymentStatus: 'pending',
        displayStatus: 'pending',
        ticketTierNames: 'Solo Entry',
        createdAt: '2026-09-18T00:00:00.000Z',
      },
    ],
    pagination: { page: 1, pageSize: 100, total: 2 },
  };

  const emptyEventsResponse = { organizerName: 'Eco Pandhari Club', counts: { all: 0, draft: 0, published: 0, completed: 0, cancelled: 0 }, events: [] };

  beforeEach(() => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1',
        email: 'owner@ecopandhari.example',
        role: 'organizer_owner',
        organizerId: 'org-1',
        token: 'fake-token',
        name: 'owner',
        orgName: null,
        avatar: 'https://example.com/avatar.png',
        isLoggedIn: true,
      }),
    );
    localStorage.removeItem('inveon_events');
    localStorage.removeItem('inveon_bookings');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('fetches real bookings across all events and renders them on the global Bookings page with correctly mapped fields', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const body = String(url).includes('/organizer/bookings') ? realBookingsResponse : emptyEventsResponse;
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/bookings');

    // The mock catalog's flagship booking is "Aarav Sharma" / BK-89211
    // (see mockBookings.js) — if that's what's showing, the real fetch
    // never took over.
    await waitFor(() => expect(screen.getByText('EPC-2026-84998')).toBeInTheDocument());
    expect(screen.getByText('EPC-2026-23569')).toBeInTheDocument();
    expect(screen.queryByText('BK-89211')).not.toBeInTheDocument();
    expect(screen.queryByText('Aarav Sharma')).not.toBeInTheDocument();

    // Real customer/contact/tier data, not mock placeholders.
    expect(screen.getByText('Divya Iyer')).toBeInTheDocument();
    expect(screen.getByText('+919012259619')).toBeInTheDocument();
    expect(screen.getByText(/2x Solo Entry/)).toBeInTheDocument();

    // Real paise-to-rupees conversion.
    expect(screen.getByText('₹998')).toBeInTheDocument();
    expect(screen.getByText('₹1,996')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/organizer/bookings?eventId=all'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }) }),
    );
  });
});
