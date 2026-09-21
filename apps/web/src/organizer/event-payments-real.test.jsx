import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import EventPayments from './pages/event-detail/EventPayments';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizer/events/evt-1/payments']}>
      <AuthProvider>
        <Routes>
          <Route path="/organizer/events/:id/payments" element={<EventPayments />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('EventPayments: real financials, not fake hardcoded fee percentages', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the real, actually-configured fee percentage and real bank details, never the old hardcoded 2.0%/1.5%', async () => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
        token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        eventName: 'Real Financials Event',
        ticketsSold: 4,
        grossRevenuePaise: 200000,
        platformFeePercent: 0,
        platformFeePaise: 0,
        netPayoutPaise: 200000,
        bankAccountHolderName: 'Real Owner',
        bankAccountNumberLast4: '4912',
        bankIfsc: 'HDFC0000123',
        payoutActive: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => expect(screen.getByText(/real financials event/i)).toBeInTheDocument());

    // Real values from the API, not the old hardcoded ones. Gross and
    // net both legitimately appear twice (once in the stat cards, once
    // in the settlement ledger table below).
    expect(screen.getAllByText('₹2,000').length).toBeGreaterThan(0); // gross
    expect(screen.getByText('Platform Fee (0%)')).toBeInTheDocument();
    expect(screen.getByText('No fee currently charged')).toBeInTheDocument();
    expect(screen.getByText('Real Owner')).toBeInTheDocument();
    expect(screen.getByText(/4912/)).toBeInTheDocument();
    expect(screen.getByText('Direct Payout Active')).toBeInTheDocument();

    // The old fake, hardcoded percentages must be gone entirely.
    expect(screen.queryByText(/2\.0%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\.5%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HDFC Bank/)).not.toBeInTheDocument();
  });

  it('shows a real, non-zero fee when the server is actually configured to charge one', async () => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
        token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        eventName: 'Fee Event',
        ticketsSold: 2,
        grossRevenuePaise: 100000,
        platformFeePercent: 5,
        platformFeePaise: 5000,
        netPayoutPaise: 95000,
        bankAccountHolderName: 'Real Owner',
        bankAccountNumberLast4: '4912',
        bankIfsc: 'HDFC0000123',
        payoutActive: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => expect(screen.getByText('Platform Fee (5%)')).toBeInTheDocument());
    expect(screen.getByText('₹50')).toBeInTheDocument(); // fee amount, appears once
    expect(screen.getAllByText('₹950').length).toBeGreaterThan(0); // net payout, appears twice
  });
});
