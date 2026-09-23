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

const realExistingEvent = {
  id: 'evt-edit-1',
  slug: 'edit-test-event',
  title: 'Original Event Title',
  shortDescription: 'Original short description',
  description: 'Original full description',
  eventDate: '2026-11-15T09:00:00.000Z',
  venueAddress: 'Original Venue, Pune',
  bannerImage: null,
  status: 'published',
  scheduleItems: null,
  packingChecklist: null,
  faqItems: null,
  cancellationPolicy: 'Original policy text',
  allowSelfServiceCancellation: true,
  refundCutoffDays: 3,
  refundPercentage: 80,
  ticketTiers: [{ id: 'real-tier-uuid-1', name: 'General', description: null, price: 500, quantity: 20, sold: 3 }],
};

describe('CreateEvent in edit mode: fetches and actually saves real changes to an existing event', () => {
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
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('loads and pre-populates the real existing event\'s data, not a blank form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => realExistingEvent }));

    renderAt('/organizer/events/evt-edit-1/edit/basic');
    await waitFor(() => expect(screen.getByDisplayValue('Original Event Title')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Original short description')).toBeInTheDocument();
    expect(screen.getByText('Edit Event')).toBeInTheDocument();
  });

  it('changing the date and saving actually PATCHes the real new date — the real fix for "no way to postpone"', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'evt-edit-1', slug: 'edit-test-event' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => realExistingEvent });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/events/evt-edit-1/edit/basic');
    await waitFor(() => expect(screen.getByDisplayValue('Original Event Title')).toBeInTheDocument());

    await user.click(screen.getByRole('link', { name: /date & location/i }));
    const dateInput = await screen.findByDisplayValue('2026-11-15');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-12-20');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
      expect(call).toBeTruthy();
    });
    const [patchUrl, patchOpts] = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(patchUrl).toBe('/api/organizer/events/evt-edit-1');
    const body = JSON.parse(patchOpts.body);
    expect(body.startDate).toBe('2026-12-20');
    expect(body.title).toBe('Original Event Title');
    expect(body.ticketTiers[0].id).toBe('real-tier-uuid-1');
  });
});
