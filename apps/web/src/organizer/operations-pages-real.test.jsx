import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Tickets from './pages/operations/Tickets';
import Participants from './pages/operations/Participants';
import Payments from './pages/operations/Payments';

function renderPage(Component, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path={path} element={<Component />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function setLoggedIn() {
  localStorage.setItem(
    'inveon_user',
    JSON.stringify({
      id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
      token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
    }),
  );
}

const sampleTicketsResponse = {
  organizerName: 'Test Org',
  organizerEvents: [{ id: 'evt-1', name: 'Real Test Event' }],
  counts: { all: 2, valid: 1, checked_in: 1, cancelled: 0 },
  tickets: [
    {
      id: 'ticket-1', attendeeName: 'Real Attendee One', customerEmail: 'one@example.com', customerPhone: '+919000000001',
      eventId: 'evt-1', eventName: 'Real Test Event', tierName: 'General', bookingId: 'booking-1', bookingReference: 'INV-BKG-2026-11111',
      status: 'valid', checkedInAt: null,
    },
    {
      id: 'ticket-2', attendeeName: 'Real Attendee Two', customerEmail: 'two@example.com', customerPhone: '+919000000002',
      eventId: 'evt-1', eventName: 'Real Test Event', tierName: 'VIP', bookingId: 'booking-2', bookingReference: 'INV-BKG-2026-22222',
      status: 'checked_in', checkedInAt: '2026-09-20T10:00:00.000Z',
    },
  ],
};

const samplePaymentsResponse = {
  summary: { totalRevenuePaise: 150000, refundedAmountPaise: 0, netPaise: 150000, platformFeePercent: 0 },
  transactions: [
    { id: 'pay-1', createdAt: '2026-09-20T10:00:00.000Z', customerName: 'Real Payer', eventName: 'Real Test Event', amountPaise: 150000, netAmountPaise: 150000, method: 'cash', status: 'paid' },
  ],
  bankAccountHolderName: 'Real Owner', bankAccountNumberLast4: '4912', bankIfsc: 'HDFC0000123', payoutActive: true,
};

describe('organizer operations pages: real data, not mock', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Tickets page shows real tab counts and real ticket rows from the API, not mock participants', async () => {
    setLoggedIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => sampleTicketsResponse }));

    renderPage(Tickets, '/organizer/tickets');

    await waitFor(() => expect(screen.getByText('Real Attendee One')).toBeInTheDocument());
    expect(screen.getByText('Real Attendee Two')).toBeInTheDocument();
    expect(screen.getByText('INV-BKG-2026-11111')).toBeInTheDocument();
    expect(screen.getByText(/All Issued Tickets/)).toBeInTheDocument();
  });

  it('Participants page shows the real attendee roster with a working real undo-checkin action', async () => {
    setLoggedIn();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/undo')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ticketId: 'ticket-2' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => sampleTicketsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage(Participants, '/organizer/participants');

    await waitFor(() => expect(screen.getByText('Real Attendee Two')).toBeInTheDocument());
    const undoButton = screen.getByRole('button', { name: /undo/i });
    await user.click(undoButton);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/undo'));
      expect(call).toBeTruthy();
    });
    const [undoUrl] = fetchMock.mock.calls.find(([u]) => String(u).includes('/undo'));
    expect(undoUrl).toBe('/api/organizer/events/evt-1/checkin/ticket-2/undo');
  });

  it('Payments page shows real revenue/refund totals and the real linked bank account, not mock payout batches', async () => {
    setLoggedIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => samplePaymentsResponse }));

    renderPage(Payments, '/organizer/payments');

    await waitFor(() => expect(screen.getAllByText('₹1,500').length).toBeGreaterThan(0));
    expect(screen.getByText('Real Payer')).toBeInTheDocument();
    expect(screen.getByText('Real Owner')).toBeInTheDocument();
    expect(screen.getByText(/4912/)).toBeInTheDocument();
    expect(screen.getByText('Direct Payout Active')).toBeInTheDocument();
  });

  it('an organizer with zero tickets/payments sees a real empty state, not fabricated rows', async () => {
    setLoggedIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ organizerName: 'Empty Org', organizerEvents: [], counts: { all: 0, valid: 0, checked_in: 0, cancelled: 0 }, tickets: [] }),
    }));

    renderPage(Tickets, '/organizer/tickets');
    await waitFor(() => expect(screen.getByText(/no tickets found/i)).toBeInTheDocument());
  });
});
