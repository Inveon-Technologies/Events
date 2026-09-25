import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TicketPage } from './TicketPage';

const TOKEN = 'INV-BKG-2026-8F3K2Q.sig';

function detail(overrides: Record<string, unknown> = {}) {
  return {
    bookingReference: 'INV-BKG-2026-8F3K2Q',
    bookingStatus: 'confirmed',
    bookedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    eventName: 'Rajgad Sunrise Trek',
    eventDate: '2026-10-18T01:00:00.000Z', // 6:30 AM IST
    gateOpenTime: '2026-10-18T00:00:00.000Z', // 5:30 AM IST
    venueAddress: 'Rajgad Fort, Velhe',
    venueMapUrl: 'https://maps.example/rajgad',
    bannerUrl: '/api/uploads/rajgad.jpg',
    organizerName: 'Eco Pandhari Club',
    organizerContactPhone: '0788 750 3856',
    locationPoints: [{ type: 'pickup', label: 'Pune, Swargate' }],
    paymentMethod: 'online',
    paymentStatus: 'paid',
    totalAmountPaise: 150000,
    ticketPageUrl: `https://events.example/t/${TOKEN}`,
    delivery: { email: 'sent', whatsapp: 'failed' },
    tickets: [
      { id: 't1', ticketReference: 'INV-BKG-2026-8F3K2Q-1', attendeeName: 'Rahul Sharma', tierName: 'General', status: 'valid' },
      { id: 't2', ticketReference: 'INV-BKG-2026-8F3K2Q-2', attendeeName: 'Priya Sharma', tierName: 'General', status: 'valid' },
    ],
    ...overrides,
  };
}

function renderAt(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }));
  return render(
    <MemoryRouter initialEntries={[`/t/${TOKEN}`]}>
      <Routes>
        <Route path="/t/:token" element={<TicketPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TicketPage (/t/:token)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the ticket in India time with the QR, PDF link and delivery status', async () => {
    renderAt(detail());
    expect(await screen.findByRole('heading', { name: 'Your Event Ticket' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/t/${encodeURIComponent(TOKEN)}`);
    expect(screen.getAllByText('5:30 AM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pune → Rajgad Fort').length).toBeGreaterThan(0);
    expect(screen.getByText('INV-TKT-2026-8F3K2Q-01')).toBeInTheDocument();
    expect(screen.getByAltText('QR code for Rahul Sharma')).toHaveAttribute('src', `/api/t/${encodeURIComponent(TOKEN)}/tickets/t1/qr`);
    expect(screen.getByRole('link', { name: /Download Ticket PDF/ })).toHaveAttribute(
      'href',
      `/api/t/${encodeURIComponent(TOKEN)}/tickets.pdf`,
    );
    expect(screen.getByText('PAID')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Not delivered')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0788 750 3856' })).toHaveAttribute('href', 'tel:07887503856');
  });

  it('switches between participants, each with their own QR code', async () => {
    renderAt(detail());
    await screen.findByAltText('QR code for Rahul Sharma');
    await userEvent.click(screen.getByRole('tab', { name: 'Priya Sharma' }));
    expect(screen.getByAltText('QR code for Priya Sharma')).toHaveAttribute('src', `/api/t/${encodeURIComponent(TOKEN)}/tickets/t2/qr`);
    expect(screen.getByText('INV-TKT-2026-8F3K2Q-02')).toBeInTheDocument();
  });

  it('hides the QR code for a cancelled booking', async () => {
    renderAt(detail({ bookingStatus: 'cancelled' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cancelled');
    expect(screen.queryByAltText(/QR code for/)).not.toBeInTheDocument();
    expect(screen.getByText('CANCELLED')).toBeInTheDocument();
  });

  it('says "Not recorded" instead of "Sending…" for older bookings without a status', async () => {
    renderAt(detail({ delivery: { email: null, whatsapp: null } }));
    await screen.findByRole('heading', { name: 'Your Event Ticket' });
    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
  });

  it('explains an invalid link', async () => {
    renderAt({ error: 'Ticket not found. Check the link.' }, 404);
    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Find my booking' })).toHaveAttribute('href', '/bookings/lookup'));
  });
});
