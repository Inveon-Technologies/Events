import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VerificationLookupPage } from './VerificationLookupPage';
import { ManageBookingPage } from './ManageBookingPage';
import { validateBookingReference, validateEmailOrPhone } from '../lib/customerSession';

type Reply = { status: number; body: unknown };

function mockFetch(...replies: Reply[]) {
  const fn = vi.fn();
  for (const reply of replies) {
    fn.mockResolvedValueOnce({ ok: reply.status < 400, status: reply.status, json: async () => reply.body });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/bookings/lookup']}>
      <Routes>
        <Route path="/bookings/lookup" element={<VerificationLookupPage />} />
        <Route path="/bookings/my" element={<p>My bookings list</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login form validation helpers', () => {
  it('checks the Booking ID and the email-or-mobile field', () => {
    expect(validateBookingReference('')).toMatch(/Enter your Booking ID/);
    expect(validateBookingReference('??')).toMatch(/exactly as on your confirmation/);
    expect(validateBookingReference('inv-bkg-2026-ab12cd')).toBe('');

    expect(validateEmailOrPhone('')).toMatch(/email address or mobile/);
    expect(validateEmailOrPhone('rahul@')).toBe('Enter a valid email address');
    expect(validateEmailOrPhone('12345')).toMatch(/10-digit mobile/);
    expect(validateEmailOrPhone('+91 98765 43210')).toBe('');
    expect(validateEmailOrPhone('rahul@example.com')).toBe('');
  });
});

describe('VerificationLookupPage', () => {
  it('shows field errors and sends nothing when the form is empty or invalid', async () => {
    const fetchMock = mockFetch();
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /Send Login Code/ }));
    expect(screen.getByText('Enter your Booking ID')).toBeInTheDocument();
    expect(screen.getByText(/Enter the email address or mobile number/)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/INV-BKG/), 'INV-BKG-2026-AB12CD');
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/), 'rahul@');
    await userEvent.click(screen.getByRole('button', { name: /Send Login Code/ }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server message under the Booking ID when the booking does not exist', async () => {
    mockFetch({ status: 404, body: { error: "We couldn't find a booking with ID INV-BKG-2026-NOPE00.", code: 'BOOKING_NOT_FOUND' } });
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText(/INV-BKG/), 'inv-bkg-2026-nope00');
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/), 'rahul@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Send Login Code/ }));
    expect(await screen.findByText(/couldn't find a booking/)).toBeInTheDocument();
    // Still on the first step — no code screen for a booking that doesn't exist.
    expect(screen.getByRole('button', { name: /Send Login Code/ })).toBeInTheDocument();
  });

  it('logs in with a mobile number: masked address, verify by Booking ID, session saved', async () => {
    const fetchMock = mockFetch(
      { status: 200, body: { success: true, sentTo: 'r***l@example.com', expiresInMinutes: 10, resendAfterSeconds: 30 } },
      { status: 200, body: { token: 'session-token', email: 'rahul@example.com' } },
    );
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText(/INV-BKG/), 'inv-bkg-2026-ab12cd');
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/), '98765 43210');
    await userEvent.click(screen.getByRole('button', { name: /Send Login Code/ }));

    expect(await screen.findByText(/r\*\*\*l@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Resend in 30s/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ bookingReference: 'INV-BKG-2026-AB12CD', contact: '98765 43210' });

    fireEvent.paste(screen.getAllByRole('textbox')[0], { clipboardData: { getData: () => '123456' } });
    await userEvent.click(screen.getByRole('button', { name: /Verify & Continue/ }));

    expect(await screen.findByText('My bookings list')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ bookingReference: 'INV-BKG-2026-AB12CD', code: '123456' });
    expect(JSON.parse(localStorage.getItem('inveon_customer_session')!)).toEqual({ token: 'session-token', email: 'rahul@example.com' });
  });

  it('shows how many attempts are left after a wrong code', async () => {
    mockFetch(
      { status: 200, body: { success: true, sentTo: 'r***l@example.com', expiresInMinutes: 10, resendAfterSeconds: 30 } },
      { status: 401, body: { error: 'That code is incorrect. 4 attempts left.' } },
    );
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText(/INV-BKG/), 'INV-BKG-2026-AB12CD');
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/), 'rahul@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Send Login Code/ }));
    await screen.findByText(/r\*\*\*l@example.com/);
    fireEvent.paste(screen.getAllByRole('textbox')[0], { clipboardData: { getData: () => '999999' } });
    await userEvent.click(screen.getByRole('button', { name: /Verify & Continue/ }));
    expect(await screen.findByText('That code is incorrect. 4 attempts left.')).toBeInTheDocument();
  });

  it('goes straight to My Bookings when already logged in', async () => {
    localStorage.setItem('inveon_customer_session', JSON.stringify({ token: 't', email: 'rahul@example.com' }));
    renderLogin();
    expect(await screen.findByText('My bookings list')).toBeInTheDocument();
  });
});

describe('ManageBookingPage', () => {
  it('opens a booking from the URL using the logged-in session, without asking again', async () => {
    localStorage.setItem('inveon_customer_session', JSON.stringify({ token: 't', email: 'rahul@example.com' }));
    const fetchMock = mockFetch({
      status: 200,
      body: {
        bookingReference: 'INV-BKG-2026-AB12CD',
        bookingStatus: 'confirmed',
        bookedAt: '2026-09-01T10:00:00.000Z',
        eventName: 'Rajgad Sunrise Trek',
        eventTagline: null,
        eventDate: '2026-10-18T01:00:00.000Z',
        gateOpenTime: null,
        venueAddress: 'Rajgad Fort',
        venueMapUrl: null,
        bannerUrl: null,
        organizerName: 'Eco Pandhari Club',
        organizerContactEmail: null,
        organizerContactPhone: null,
        packingChecklist: null,
        cancellationPolicyText: null,
        primaryContactName: 'Rahul Sharma',
        primaryContactEmail: 'rahul@example.com',
        primaryContactWhatsapp: '+919876543210',
        totalAmountPaise: 150000,
        paymentMethod: 'online',
        paymentStatus: 'paid',
        paymentReference: null,
        tierBreakdown: [],
        refundAmountPaise: null,
        refundStatus: null,
        allowSelfServiceCancellation: false,
        refundCutoffDays: null,
        refundPercentage: null,
        refundCutoffPassed: false,
        tickets: [],
        ticketPageUrl: 'https://events.example/t/INV-BKG-2026-AB12CD.sig',
      },
    });
    render(
      <MemoryRouter initialEntries={['/bookings/INV-BKG-2026-AB12CD/manage']}>
        <Routes>
          <Route path="/bookings/:bookingId/manage" element={<ManageBookingPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText('Rajgad Sunrise Trek').length).toBeGreaterThan(0));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings/INV-BKG-2026-AB12CD/tickets?email=rahul%40example.com');
    expect(screen.getByRole('link', { name: /Open Digital Ticket/ })).toHaveAttribute(
      'href',
      'https://events.example/t/INV-BKG-2026-AB12CD.sig',
    );
  });

  it('asks for the details with a clear message when the booking does not match', async () => {
    mockFetch({ status: 404, body: { error: 'Booking not found' } });
    render(
      <MemoryRouter initialEntries={['/bookings/manage']}>
        <Routes>
          <Route path="/bookings/manage" element={<ManageBookingPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText(/INV-BKG/), 'INV-BKG-2026-AB12CD');
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/), '9876543210');
    await userEvent.click(screen.getByRole('button', { name: /View My Booking/ }));
    expect(await screen.findByText(/No booking matches this Booking ID/)).toBeInTheDocument();
  });
});
