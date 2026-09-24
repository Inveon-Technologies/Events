import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const bookingDetail = {
  bookingReference: 'INV-BKG-2026-GALLERY1', bookingStatus: 'confirmed', bookedAt: '2026-08-01T10:00:00.000Z',
  eventName: 'Summit Trek', eventTagline: null, eventDate: '2026-09-01T02:00:00.000Z', gateOpenTime: null,
  venueAddress: null, venueMapUrl: null, bannerUrl: null, organizerName: 'Sahyadri Trails',
  organizerContactEmail: null, organizerContactPhone: null, packingChecklist: null, cancellationPolicyText: null,
  primaryContactName: 'Asha', primaryContactEmail: 'asha@example.com', primaryContactWhatsapp: '+919000000001',
  totalAmountPaise: 0, paymentMethod: 'online', paymentStatus: 'paid', paymentReference: null,
  tierBreakdown: [], refundAmountPaise: null, refundStatus: null, allowSelfServiceCancellation: false,
  refundCutoffDays: null, refundPercentage: null, refundCutoffPassed: true,
  tickets: [{ id: 't1', ticketReference: 'INV-BKG-2026-GALLERY1-1', attendeeName: 'Asha', tierName: 'General', status: 'checked_in', checkedInAt: '2026-09-01T02:10:00.000Z' }],
};

describe('post-event photos & videos link', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('customers see the organizer\'s shared link on their booking page', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ ...bookingDetail, galleryUrl: 'https://drive.google.com/drive/folders/summit', galleryNote: 'Tag us when you post!' }),
    }));

    renderAt('/bookings/x/manage');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-GALLERY1');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: /view my booking/i }));

    const link = await screen.findByRole('link', { name: /view photos & videos/i });
    expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/summit');
    expect(screen.getByText('Tag us when you post!')).toBeInTheDocument();
  });

  it('shows nothing when the organizer has not shared a link', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...bookingDetail, galleryUrl: null, galleryNote: null }) }));

    renderAt('/bookings/x/manage');
    await user.type(screen.getByPlaceholderText('INV-BKG-2026-12345'), 'INV-BKG-2026-GALLERY1');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: /view my booking/i }));

    await waitFor(() => expect(screen.getByText('Summit Trek')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /view photos & videos/i })).not.toBeInTheDocument();
  });

  it('organizers share the link from a completed event\'s dashboard', async () => {
    const user = userEvent.setup();
    localStorage.setItem('inveon_user', JSON.stringify({
      id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1', token: 't', name: 'Owner', orgName: null, avatar: null, isLoggedIn: true,
    }));
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PUT' && u.includes('/gallery')) {
        puts.push(JSON.parse(String(init.body)));
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ galleryUrl: 'https://drive.google.com/drive/folders/summit', galleryNote: null }) });
      }
      if (u.endsWith('/organizer/events/evt-past')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'evt-past', galleryUrl: null, galleryNote: null, ticketTiers: [], media: [] }) });
      }
      if (u.includes('/organizer/events')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({
            organizerName: 'Org', counts: { all: 1, draft: 0, published: 0, completed: 1, cancelled: 0 },
            events: [{ id: 'evt-past', eventCode: 'EVT-1', name: 'Summit Trek', eventDate: '2026-01-10T02:00:00.000Z', venueAddress: 'Pune', bannerUrl: null, capacity: 10, ticketsSold: 1, revenuePaise: 0, displayStatus: 'completed' }],
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ bookings: [], pagination: { total: 0 } }) });
    }));

    renderAt('/organizer/events/evt-past/dashboard');
    const input = await screen.findByLabelText('Photos and videos link');
    await user.type(input, 'https://drive.google.com/drive/folders/summit');
    await user.click(screen.getByRole('button', { name: /share with attendees/i }));

    await waitFor(() => expect(puts).toEqual([{ url: 'https://drive.google.com/drive/folders/summit', note: '' }]));
    expect(await screen.findByRole('button', { name: /update link/i })).toBeInTheDocument();
  });
});
