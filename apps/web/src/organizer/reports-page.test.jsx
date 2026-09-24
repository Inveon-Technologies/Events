import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Reports from './pages/operations/Reports';

function setLoggedIn() {
  localStorage.setItem(
    'inveon_user',
    JSON.stringify({
      id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
      token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
    }),
  );
}

const events = [{ id: 'evt-1', name: 'Sunrise Trek' }, { id: 'evt-2', name: 'Night Walk' }];

function reportFor(url) {
  if (url.includes('/reports/sales')) {
    return {
      type: 'sales', events,
      columns: [{ key: 'bookingReference', label: 'Booking reference' }, { key: 'customerName', label: 'Customer' }, { key: 'amountRupees', label: 'Amount (INR)' }],
      rows: [{ bookingReference: 'INV-BKG-2026-SALE1', customerName: '=Evil()', amountRupees: 1000 }],
      summary: [{ label: 'Gross collected', value: '₹1,000.00' }],
    };
  }
  return {
    type: 'attendees', events,
    columns: [{ key: 'attendeeName', label: 'Attendee' }, { key: 'event', label: 'Event' }],
    rows: [{ attendeeName: 'Real Attendee', event: 'Sunrise Trek' }],
    summary: [{ label: 'Tickets', value: 1 }],
  };
}

describe('organizer Reports page (#64)', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads real report data, filters by event and downloads a formula-safe CSV', async () => {
    setLoggedIn();
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve({ ok: true, status: 200, json: async () => reportFor(String(url)) }));
    vi.stubGlobal('fetch', fetchMock);
    let csvBlob = null;
    URL.createObjectURL = vi.fn((blob) => {
      csvBlob = blob;
      return 'blob:csv';
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationProvider>
            <Reports />
          </NotificationProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Real Attendee')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/organizer/reports/attendees')).toBe(true);

    await user.click(screen.getByRole('tab', { name: /Sales/ }));
    await waitFor(() => expect(screen.getByText('INV-BKG-2026-SALE1')).toBeInTheDocument());
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Event'), 'evt-2');
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/organizer/reports/sales?eventId=evt-2')).toBe(true));
    await waitFor(() => expect(screen.getByRole('button', { name: /Download Sales CSV/ })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: /Download Sales CSV/ }));
    expect(clickSpy).toHaveBeenCalled();
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(csvBlob);
    });
    expect(text).toContain('"Booking reference","Customer","Amount (INR)"');
    expect(text).toContain(`"INV-BKG-2026-SALE1","'=Evil()","1000"`);
  });

  it('shows the API error instead of an empty table', async () => {
    setLoggedIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Dates must be in YYYY-MM-DD format' }) }));
    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationProvider>
            <Reports />
          </NotificationProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Dates must be in YYYY-MM-DD format'));
  });
});
