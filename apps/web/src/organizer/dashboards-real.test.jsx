import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const events = {
  organizerName: 'Sahyadri Trails',
  counts: { all: 1, draft: 0, published: 1, completed: 0, cancelled: 0 },
  events: [{
    id: 'evt-1', eventCode: 'EVT-1', name: 'Harishchandragad Night Trek', eventDate: '2027-02-01T12:30:00.000Z',
    venueAddress: 'Khireshwar', bannerUrl: null, capacity: 40, ticketsSold: 12, checkedInCount: 5, revenuePaise: 900000, displayStatus: 'published',
  }],
};
const bookings = {
  bookings: [
    { id: 'b1', bookingReference: 'INV-BKG-2027-AAAA1111', eventId: 'evt-1', eventName: 'Harishchandragad Night Trek', customerName: 'Asha', customerEmail: 'a@x.com', customerPhone: '1', ticketCount: 2, totalAmountPaise: 150000, displayStatus: 'confirmed', paymentMethod: 'online', createdAt: '2027-01-01T00:00:00.000Z' },
    { id: 'b2', bookingReference: 'INV-BKG-2027-BBBB2222', eventId: 'evt-1', eventName: 'Harishchandragad Night Trek', customerName: 'Ravi', customerEmail: 'r@x.com', customerPhone: '2', ticketCount: 1, totalAmountPaise: 50000, displayStatus: 'confirmed', paymentMethod: 'online', createdAt: '2027-01-02T00:00:00.000Z' },
  ],
  pagination: { page: 1, pageSize: 100, total: 2 },
};
const tickets = {
  organizerName: 'Sahyadri Trails', organizerEvents: [{ id: 'evt-1', name: 'Harishchandragad Night Trek' }],
  counts: { all: 3, valid: 2, checked_in: 1, cancelled: 0 },
  tickets: [
    { id: 't1', attendeeName: 'Asha Kulkarni', customerEmail: 'a@x.com', customerPhone: '1', eventId: 'evt-1', eventName: 'Harishchandragad Night Trek', tierName: 'General', bookingId: 'b1', bookingReference: 'INV-BKG-2027-AAAA1111', status: 'checked_in', checkedInAt: '2027-02-01T12:00:00.000Z' },
    { id: 't2', attendeeName: 'Meera Kulkarni', customerEmail: 'a@x.com', customerPhone: '1', eventId: 'evt-1', eventName: 'Harishchandragad Night Trek', tierName: 'General', bookingId: 'b1', bookingReference: 'INV-BKG-2027-AAAA1111', status: 'valid', checkedInAt: null },
    { id: 't3', attendeeName: 'Ravi Patil', customerEmail: 'r@x.com', customerPhone: '2', eventId: 'evt-1', eventName: 'Harishchandragad Night Trek', tierName: 'Backpacker', bookingId: 'b2', bookingReference: 'INV-BKG-2027-BBBB2222', status: 'valid', checkedInAt: null },
  ],
};

let calls;
function stubApi(overrides = {}) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url, init) => {
    const u = String(url);
    calls.push([init?.method ?? 'GET', u]);
    const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
    for (const [pattern, body] of Object.entries(overrides)) if (u.includes(pattern)) return json(body);
    if (u.includes('/organizer/dashboard')) return json({ organizerName: 'Sahyadri Trails', bookingsThisWeek: 3, revenuePaiseThisMonth: 420000, nextUpcomingEventName: 'Harishchandragad Night Trek', checkedInCount: 5, checkedInEligibleCount: 12 });
    if (u.includes('/organizer/notifications')) return json({ notifications: [] });
    if (u.includes('/organizer/profile')) return json({ name: 'Sahyadri Trails', logoUrl: null });
    if (u.includes('/organizer/bookings')) return json(bookings);
    if (u.includes('/organizer/tickets')) return json(tickets);
    if (u.includes('/checkin/ticket/')) return json({ ticketId: 't2' });
    if (u.includes('/financials')) return json({ eventName: 'x', ticketsSold: 12, grossRevenuePaise: 900000, platformFeePercent: 5, platformFeePaise: 45000, netPayoutPaise: 855000, payoutActive: true });
    if (u.endsWith('/organizer/events/evt-1')) return json({ id: 'evt-1', ticketTiers: [{ id: 'tier-1', name: 'General', description: null, price: 750, quantity: 30, sold: 10 }, { id: 'tier-2', name: 'Backpacker', description: null, price: 500, quantity: 10, sold: 2 }], media: [], galleryUrl: null });
    if (u.includes('/organizer/events')) return json(events);
    return json({});
  }));
}

describe('organizer dashboards and tables show real data only', () => {
  beforeEach(() => {
    localStorage.setItem('inveon_user', JSON.stringify({ id: 'u1', email: 'o@x.com', role: 'organizer_owner', organizerId: 'org-1', token: 't', name: 'Asha', orgName: null, avatar: null, isLoggedIn: true }));
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('main dashboard: real totals and week/month figures, no invented trends', async () => {
    stubApi();
    renderAt('/organizer/dashboard');
    await waitFor(() => expect(screen.getByText('₹4,200 this month')).toBeInTheDocument());
    expect(screen.getByText('3 bookings this week')).toBeInTheDocument();
    expect(screen.getByText('of 12 tickets (42%)')).toBeInTheDocument();
    expect(screen.queryByText(/\+18\.4%|\+12\.2%|\+4 today/)).not.toBeInTheDocument();
  });

  it('event dashboard: real tiers, check-ins, average order and payout', async () => {
    stubApi();
    renderAt('/organizer/events/evt-1/dashboard');
    expect(await screen.findByText('10 / 30 (33%)')).toBeInTheDocument();
    expect(screen.getByText('2 / 10 (20%)')).toBeInTheDocument();
    expect(screen.getByText('Average paid order: ₹1,000')).toBeInTheDocument();
    expect(screen.getByText('Your payout: ₹8,550 after 5% fee')).toBeInTheDocument();
    expect(screen.getByText('1 / 12')).toBeInTheDocument();
    expect(screen.getByText('Asha Kulkarni')).toBeInTheDocument();
    expect(screen.queryByText(/2,450/)).not.toBeInTheDocument();
  });

  it('event roster: real attendees, real manual check-in, filters', async () => {
    stubApi();
    const user = userEvent.setup();
    renderAt('/organizer/events/evt-1/participants');
    const row = (await screen.findByText('Meera Kulkarni')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Check In' }));
    await waitFor(() => expect(calls).toContainEqual(['POST', expect.stringContaining('/organizer/events/evt-1/checkin/ticket/t2')]));

    await user.selectOptions(screen.getByLabelText('Filter by check-in status'), 'checked_in');
    expect(screen.getByText('Asha Kulkarni')).toBeInTheDocument();
    expect(screen.queryByText('Ravi Patil')).not.toBeInTheDocument();
    expect(screen.queryByText(/Blood|Direct Base Arrival/)).not.toBeInTheDocument();
  });

  it('event bookings page: after the event the Drive link box and certificate status are right there', async () => {
    stubApi({
      '/organizer/events/evt-1/certificate': { enabled: true },
      '/organizer/events/evt-1/gallery': { galleryUrl: 'https://drive.google.com/drive/folders/xyz', galleryNote: null },
    });
    const fetchMock = globalThis.fetch;
    const inner = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) => {
      if (String(url).endsWith('/organizer/events/evt-1') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'evt-1', eventDate: '2020-01-01T10:00:00.000Z', galleryUrl: null }) });
      }
      return inner(url, init);
    });
    renderAt('/organizer/events/evt-1/bookings');
    const card = await screen.findByTestId('event-gallery-card');
    const input = await within(card).findByLabelText('Photos and videos link');
    await userEvent.type(input, 'https://drive.google.com/drive/folders/xyz');
    await userEvent.click(within(card).getByRole('button', { name: 'Share with attendees' }));
    await waitFor(() => expect(calls.some(([m, u]) => m === 'PUT' && u.endsWith('/organizer/events/evt-1/gallery'))).toBe(true));
    const cert = screen.getByTestId('certificate-status-card');
    await waitFor(() => expect(within(cert).getByText('On')).toBeInTheDocument());
    expect(within(cert).getByRole('link', { name: /edit certificate design/i })).toHaveAttribute('href', '/organizer/events/evt-1/certificate');
  });

  it('notifications come from the real activity feed, and read state sticks', async () => {
    stubApi({
      '/organizer/notifications': { notifications: [{ id: 'booking:b1:created', category: 'bookings', title: 'New booking', message: 'Asha booked 2 tickets for Harishchandragad Night Trek (₹1,500).', createdAt: new Date().toISOString(), link: '/organizer/bookings' }] },
    });
    const user = userEvent.setup();
    renderAt('/organizer/notifications');
    expect(await screen.findByText('Asha booked 2 tickets for Harishchandragad Night Trek (₹1,500).')).toBeInTheDocument();
    expect(screen.queryByText(/Aarav Sharma|HDFC/)).not.toBeInTheDocument();

    await user.click(screen.getByText('Asha booked 2 tickets for Harishchandragad Night Trek (₹1,500).'));
    expect(JSON.parse(localStorage.getItem('inveon_notification_state:org-1')).read).toEqual(['booking:b1:created']);
  });
});
