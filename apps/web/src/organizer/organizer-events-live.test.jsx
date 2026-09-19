import { render, screen, waitFor } from '@testing-library/react';
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
});
