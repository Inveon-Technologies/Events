import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const realEventsResponse = {
  organizerName: 'Eco Pandhari Club',
  counts: { all: 1, draft: 0, published: 1, completed: 0, cancelled: 0 },
  events: [
    {
      id: 'evt-tiers-1',
      eventCode: 'EVT-TIERS1',
      name: 'Tier Test Event',
      eventDate: '2026-10-16T05:29:29.684Z',
      venueAddress: 'Pune',
      bannerUrl: null,
      capacity: 20,
      ticketsSold: 3,
      revenuePaise: 15000,
      displayStatus: 'published',
    },
  ],
};

const realEventDetailResponse = {
  id: 'evt-tiers-1',
  slug: 'tier-test-event',
  title: 'Tier Test Event',
  shortDescription: null,
  description: null,
  eventDate: '2026-10-16T05:29:29.684Z',
  venueAddress: 'Pune',
  bannerImage: null,
  status: 'published',
  scheduleItems: null,
  packingChecklist: null,
  faqItems: null,
  cancellationPolicy: null,
  allowSelfServiceCancellation: false,
  refundCutoffDays: null,
  refundPercentage: null,
  ticketTiers: [
    { id: 'real-tier-uuid-aaa', name: 'General', description: 'Standard entry', price: 500, quantity: 20, sold: 3 },
  ],
};

describe('EventTickets.jsx: real tier display and real tier-add payload', () => {
  beforeEach(() => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
        token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the real tier, with its real sold/quantity progress, fetched from the real event detail endpoint', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/organizer/events/evt-tiers-1') && !urlStr.includes('duplicate')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => realEventDetailResponse });
      }
      if (urlStr.includes('/organizer/events')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => realEventsResponse });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/events/evt-tiers-1/tickets');
    await waitFor(() => expect(screen.getByText('General')).toBeInTheDocument());
    expect(screen.getByText('Standard entry')).toBeInTheDocument();
    expect(screen.getByText('3 / 20 (15%)')).toBeInTheDocument();
  });

  it('adding a new tier sends the real existing tier\'s real id plus the new tier with no id — not the old broken payload that always dropped every existing tier', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'evt-tiers-1' }) });
      }
      if (urlStr.includes('/organizer/events/evt-tiers-1') && !urlStr.includes('duplicate')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => realEventDetailResponse });
      }
      if (urlStr.includes('/organizer/events')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => realEventsResponse });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/events/evt-tiers-1/tickets');
    await waitFor(() => expect(screen.getByText('General')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add ticket pass/i }));
    await user.type(screen.getByPlaceholderText(/vip backstage pass/i), 'VIP Pass');
    await user.click(screen.getByRole('button', { name: /create ticket tier/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
      expect(call).toBeTruthy();
    });
    const [, patchOpts] = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    const body = JSON.parse(patchOpts.body);
    expect(body.ticketTiers).toHaveLength(2);
    expect(body.ticketTiers[0]).toEqual({ id: 'real-tier-uuid-aaa', name: 'General', description: 'Standard entry', price: 500, quantity: 20 });
    expect(body.ticketTiers[1]).toEqual({ name: 'VIP Pass', description: '', price: 999, quantity: 20 });
    expect(body.ticketTiers[1].id).toBeUndefined();
  });
});
