import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

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

function setLoggedIn() {
  localStorage.setItem(
    'inveon_user',
    JSON.stringify({
      id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
      token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
    }),
  );
}

const realEventsResponse = {
  organizerName: 'Test Org',
  counts: { all: 1, draft: 0, published: 1, completed: 0, cancelled: 0 },
  events: [
    {
      id: 'evt-checkin-1', eventCode: 'EVT-CI1', name: 'Check-in Test Event', eventDate: '2026-12-25T09:00:00.000Z',
      venueAddress: 'Pune', bannerUrl: null, capacity: 50, ticketsSold: 3, revenuePaise: 150000, displayStatus: 'published',
    },
  ],
};

describe('CheckIn page: real manual scan flow (camera path exercises the same processScan logic)', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('a real successful check-in shows the real attendee name and tier, and calls the real endpoint with the entered code', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/checkin')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ ticketId: 't1', attendeeName: 'Real Checkin Attendee', tierName: 'General', bookingReference: 'INV-BKG-2026-99999', checkedInAt: '2026-09-21T10:00:00.000Z' }),
        });
      }
      if (String(url).includes('/organizer/tickets')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ tickets: [] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => realEventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/check-in');
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox'), 'evt-checkin-1');

    await user.type(screen.getByPlaceholderText(/paste or type the ticket/i), 'real-qr-token-123');
    await user.click(screen.getByRole('button', { name: /check in/i }));

    await waitFor(() => expect(screen.getAllByText('Admitted').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Real Checkin Attendee/).length).toBeGreaterThan(0);

    const checkinCall = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/checkin'));
    expect(checkinCall[0]).toBe('/api/organizer/events/evt-checkin-1/checkin');
    expect(JSON.parse(checkinCall[1].body)).toEqual({ qrToken: 'real-qr-token-123' });
  });

  it('a real cancelled-ticket rejection shows the real "Cancelled Ticket" title, not a generic error', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/checkin')) {
        return Promise.resolve({
          ok: false, status: 409,
          json: async () => ({ error: 'This ticket has been cancelled and is no longer valid for entry', reasonCode: 'cancelled' }),
        });
      }
      if (String(url).includes('/organizer/tickets')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ tickets: [] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => realEventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/check-in');
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox'), 'evt-checkin-1');

    await user.type(screen.getByPlaceholderText(/paste or type the ticket/i), 'cancelled-ticket-token');
    await user.click(screen.getByRole('button', { name: /check in/i }));

    await waitFor(() => expect(screen.getAllByText('Cancelled Ticket').length).toBeGreaterThan(0));
    expect(screen.getByText(/no longer valid for entry/i)).toBeInTheDocument();
  });

  it('a real already-checked-in rejection shows the real distinct title', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/checkin')) {
        return Promise.resolve({
          ok: false, status: 409,
          json: async () => ({ error: 'This ticket was already checked in at 2026-09-21T09:00:00.000Z', reasonCode: 'already_checked_in' }),
        });
      }
      if (String(url).includes('/organizer/tickets')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ tickets: [] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => realEventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/check-in');
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox'), 'evt-checkin-1');

    await user.type(screen.getByPlaceholderText(/paste or type the ticket/i), 'dup-scan-token');
    await user.click(screen.getByRole('button', { name: /check in/i }));

    await waitFor(() => expect(screen.getAllByText('Already Checked In').length).toBeGreaterThan(0));
  });

  it('shows the real waiting queue fetched from the real endpoint', async () => {
    setLoggedIn();
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/organizer/tickets')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ tickets: [{ id: 't1', attendeeName: 'Queued Real Attendee', bookingReference: 'INV-BKG-2026-11111', tierName: 'VIP' }] }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => realEventsResponse });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/check-in');
    await waitFor(() => expect(screen.getByText('Queued Real Attendee')).toBeInTheDocument());
    expect(screen.getByText(/INV-BKG-2026-11111/)).toBeInTheDocument();
  });
});
