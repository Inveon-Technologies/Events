import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { OrganizerAuthProvider } from './context/AuthContext';
import { OrganizerLoginPage } from './pages/OrganizerLoginPage';
import { OrganizerDashboardPage } from './pages/OrganizerDashboardPage';
import { OrganizerBookingsPage } from './pages/OrganizerBookingsPage';

function renderWithProviders(ui: React.ReactNode, initialPath = '/') {
  return render(
    <OrganizerAuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </OrganizerAuthProvider>,
  );
}

describe('OrganizerLoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('submits real form values to POST /auth/login and shows a server error on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid email or password' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrganizerLoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@ecopandhari.example' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'owner@ecopandhari.example', password: 'wrong-password' }),
      }),
    );

    vi.unstubAllGlobals();
  });
});

describe('OrganizerDashboardPage', () => {
  const dashboardPayload = {
    organizerName: 'Eco Pandhari Club',
    totalEvents: 2,
    upcomingEventsCount: 2,
    nextUpcomingEventName: 'Rajgad Sunrise Trek',
    totalBookings: 8,
    bookingsThisWeek: 3,
    totalParticipants: 15,
    revenuePaiseThisMonth: 769000,
    checkedInCount: 5,
    checkedInEligibleCount: 15,
    upcomingEvents: [
      {
        id: 'evt-1',
        name: 'Rajgad Sunrise Trek',
        eventDate: '2026-10-05T13:00:00.000Z',
        venueAddress: 'Rajgad Fort, Pune',
        bannerUrl: null,
        status: 'published',
        capacity: 150,
        bookedCount: 13,
        revenuePaise: 499000,
      },
    ],
    recentBookings: [
      {
        id: 'bkg-1',
        bookingReference: 'EPC-2026-00124',
        eventName: 'Rajgad Sunrise Trek',
        customerName: 'Rahul Sharma',
        ticketCount: 3,
        totalAmountPaise: 149700,
        status: 'confirmed',
      },
    ],
    bookingActivity: Array.from({ length: 14 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      count: i % 3,
    })),
  };

  beforeEach(() => {
    localStorage.setItem(
      'inveon.organizer.auth',
      JSON.stringify({
        token: 'fake-token',
        user: { id: 'u1', email: 'owner@ecopandhari.example', role: 'organizer_owner', organizerId: 'org-1' },
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('fetches real dashboard data and renders the actual numbers, not placeholders', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dashboardPayload,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrganizerDashboardPage />);

    await waitFor(() => expect(screen.getByText(/welcome back, eco pandhari club/i)).toBeInTheDocument());

    function statValue(icon: string): string | null {
      const card = screen.getByTestId(`stat-${icon}`);
      return card.querySelector('p.text-2xl')?.textContent ?? null;
    }

    // Stat cards — scoped to each card's testid so this doesn't collide
    // with the same digit/label text appearing elsewhere on the page.
    expect(statValue('events')).toBe('2');
    expect(statValue('bookings')).toBe('8');
    expect(statValue('participants')).toBe('15');
    expect(statValue('revenue')).toBe('₹7,690');

    // Upcoming events list — real event name + real progress numbers.
    // The booked/capacity text is split across nested <span>s in the
    // markup (matches the mockup's own structure), so match on normalized
    // textContent rather than RTL's default (which doesn't span nested
    // elements reliably).
    expect(screen.getAllByText(/rajgad sunrise trek/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim() === '13 / 150 booked')
        .length,
    ).toBeGreaterThan(0);

    // Recent bookings table — real booking reference + customer
    expect(screen.getByText('EPC-2026-00124')).toBeInTheDocument();
    expect(screen.getByText('Rahul Sharma')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/organizer/dashboard'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }) }),
    );
  });

  it('shows an error message when the dashboard request fails instead of silently staying blank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrganizerDashboardPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/internal server error/i));
  });
});

describe('OrganizerBookingsPage', () => {
  // Shaped exactly like the live-verified API response for the Rajgad
  // Sunrise Trek seed data (counts, the partially-cancelled booking's
  // reduced ticket count, etc. all match what GET /organizer/bookings
  // actually returned against a real Postgres instance).
  const bookingsPayload = {
    organizerName: 'Eco Pandhari Club',
    event: { id: 'evt-rajgad', name: 'Rajgad Sunrise Trek', eventDate: '2026-10-05T13:00:00.000Z', status: 'published' },
    organizerEvents: [
      { id: 'evt-rajgad', name: 'Rajgad Sunrise Trek' },
      { id: 'evt-workshop', name: 'Pune Business Workshop' },
    ],
    counts: { all: 7, confirmed: 4, pending: 1, cancelled: 1, partially_cancelled: 1 },
    bookings: [
      {
        id: 'bkg-partial',
        bookingReference: 'EPC-2026-18099',
        customerName: 'Sneha Joshi',
        customerEmail: 'sneha.joshi@example.com',
        eventName: 'Rajgad Sunrise Trek',
        ticketCount: 2,
        totalAmountPaise: 149700,
        paymentStatus: 'paid',
        displayStatus: 'partially_cancelled' as const,
        createdAt: '2026-09-13T00:00:00.000Z',
      },
      {
        id: 'bkg-cancelled',
        bookingReference: 'EPC-2026-93711',
        customerName: 'Amit Kumar',
        customerEmail: 'amit.kumar@example.com',
        eventName: 'Rajgad Sunrise Trek',
        ticketCount: 0,
        totalAmountPaise: 49900,
        paymentStatus: null,
        displayStatus: 'cancelled' as const,
        createdAt: '2026-09-09T00:00:00.000Z',
      },
    ],
    pagination: { page: 1, pageSize: 10, total: 7 },
  };

  beforeEach(() => {
    localStorage.setItem(
      'inveon.organizer.auth',
      JSON.stringify({
        token: 'fake-token',
        user: { id: 'u1', email: 'owner@ecopandhari.example', role: 'organizer_owner', organizerId: 'org-1' },
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('fetches real bookings for the selected event and renders correct per-status counts and rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => bookingsPayload,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrganizerBookingsPage />);

    await waitFor(() => expect(screen.getByText('EPC-2026-18099')).toBeInTheDocument());

    // Tab counts reflect the real derived-status breakdown, not just "all".
    expect(screen.getByRole('button', { name: /all \(7\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmed \(4\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /partially cancelled \(1\)/i })).toBeInTheDocument();

    // The partially-cancelled row shows the REDUCED ticket count (2, not
    // the original 3) and its distinct badge — proving the derived status
    // from the backend renders correctly, not just a raw booking.status.
    expect(screen.getByText('PARTIALLY CANCELLED')).toBeInTheDocument();
    const partialRow = screen.getByText('EPC-2026-18099').closest('tr');
    expect(partialRow).toHaveTextContent('2'); // ticket count
    expect(partialRow).toHaveTextContent('₹1,497');

    // The cancelled row shows no payment status (null -> em dash), not a
    // fabricated one.
    const cancelledRow = screen.getByText('EPC-2026-93711').closest('tr');
    expect(cancelledRow).toHaveTextContent('—');

    // Verify the request actually asked for the right event and defaults.
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/organizer/bookings');
    expect(calledUrl).toContain('status=all');
    expect(calledUrl).toContain('sort=newest');
  });

  it('re-fetches with the new status when a tab is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => bookingsPayload,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrganizerBookingsPage />);
    await waitFor(() => expect(screen.getByText('EPC-2026-18099')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /pending \(1\)/i }));

    await waitFor(() => {
      const lastCallUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
      expect(lastCallUrl).toContain('status=pending');
    });
  });

  it('re-fetches with the search term when typed into the search box', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => bookingsPayload,
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrganizerBookingsPage />);
    await waitFor(() => expect(screen.getByText('EPC-2026-18099')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/search by booking id/i), { target: { value: 'sharma' } });

    await waitFor(() => {
      const lastCallUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
      expect(lastCallUrl).toContain('search=sharma');
    });
  });
});
