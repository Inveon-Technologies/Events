import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { resetBrandingCache } from '../lib/branding';

const KEY = 'k7Qp2Vx9LmT4sRw8ZyA1';
const BASE = `/api/sa/${KEY}`;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;

function stubFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const r = handler(url, init) ?? { status: 404, body: { error: 'Not found' } };
    const status = r.status ?? 200;
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return {
      ok: status < 400,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
      blob: async () => new Blob([text]),
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const dashboard = {
  totals: {
    organizers: 12,
    blocked_organizers: 1,
    organizer_users: 20,
    events: 30,
    live_events: 4,
    bookings: 500,
    confirmed_bookings: 480,
    pending_bookings: 2,
    tickets: 900,
    checked_in: 300,
    customers: 410,
    blocked_customers: 3,
    revenue_paise: 12345600,
    online_revenue_paise: 10000000,
    refunded_paise: 50000,
  },
  windows: { bookings_24h: 7, bookings_7d: 40, bookings_30d: 120, revenue_24h: 100, revenue_7d: 200, revenue_30d: 5000000 },
  platformFeePercent: 5,
  platformEarningsPaise: 500000,
  grossRevenuePaise: 12345600,
  daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, bookings: i, revenuePaise: i * 100 })),
  topEvents: [{ id: 'e1', name: 'Rajgad Trek', organizer_name: 'Sahyadri Trails', bookings: 90, revenue_paise: 4500000 }],
  recentBookings: [],
  notifications24h: [{ channel: 'email', status: 'failed', count: 2 }],
};

describe('super admin portal', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('looks like an ordinary missing page at a wrong secret path', async () => {
    stubFetch(() => undefined);
    renderAt('/x/not-the-right-key/dashboard');
    expect(await screen.findByText('This page doesn’t exist.')).toBeInTheDocument();
    expect(screen.queryByText(/Control Center/)).not.toBeInTheDocument();
  });

  it('signs in with password then emailed code, and shows the dashboard', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url === `${BASE}/ping`) return { body: { ok: true } };
      if (url === `${BASE}/auth/login`) return { body: { codeSent: true } };
      if (url === `${BASE}/auth/verify`) {
        const body = JSON.parse(String(init?.body));
        return body.code === '123456'
          ? { body: { token: 'sa-token', admin: { email: 'ops@inveon.in', name: 'Ops Lead' }, expiresInHours: 4 } }
          : { status: 401, body: { error: 'Wrong code — 4 attempts left' } };
      }
      if (url === `${BASE}/dashboard`) return { body: dashboard };
      return undefined;
    });
    renderAt(`/x/${KEY}`);
    await userEvent.type(await screen.findByLabelText('Email'), 'ops@inveon.in');
    await userEvent.type(screen.getByLabelText('Password'), 'Tr4il-Runner#Sahyadri9');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const codeBox = await screen.findByLabelText(/6-digit code sent to ops@inveon.in/);
    await userEvent.type(codeBox, '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong code');
    await userEvent.clear(codeBox);
    await userEvent.type(codeBox, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Gross ticket sales')).toBeInTheDocument();
    expect(screen.getByText('₹1,23,456')).toBeInTheDocument();
    expect(screen.getByText('Rajgad Trek')).toBeInTheDocument();
    const dashCall = fetchMock.mock.calls.find(([u]) => String(u) === `${BASE}/dashboard`)!;
    expect((dashCall[1]?.headers as Record<string, string>).Authorization).toBe('Bearer sa-token');
    // The session stays in this tab only.
    expect(JSON.parse(sessionStorage.getItem('inveon_sa_session')!).token).toBe('sa-token');
    expect(localStorage.getItem('inveon_sa_session')).toBeNull();
  });

  it('blocks an organizer with a reason', async () => {
    sessionStorage.setItem(
      'inveon_sa_session',
      JSON.stringify({ token: 't', email: 'ops@inveon.in', name: 'Ops', expiresAt: Date.now() + 3600_000 }),
    );
    const fetchMock = stubFetch((url) => {
      if (url === `${BASE}/ping`) return { body: { ok: true } };
      if (url.startsWith(`${BASE}/organizers?`))
        return {
          body: {
            organizers: [
              {
                id: 'org-1',
                name: 'Sahyadri Trails',
                slug: 'sahyadri',
                contact_email: 'hi@sahyadri.in',
                contact_phone: null,
                cashfree_vendor_status: 'active',
                blocked_at: null,
                blocked_reason: null,
                created_at: '2026-01-01T00:00:00Z',
                users: 2,
                events: 3,
                bookings: 40,
                revenue_paise: 100000,
              },
            ],
            page: 1,
            pageSize: 50,
            total: 1,
          },
        };
      if (url === `${BASE}/organizers/org-1/block`) return { body: { ok: true } };
      return undefined;
    });
    renderAt(`/x/${KEY}/organizers`);
    const row = (await screen.findByText('Sahyadri Trails')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Block' }));
    await userEvent.type(within(row).getByLabelText('Reason'), 'KYC mismatch');
    await userEvent.click(within(row).getByRole('button', { name: 'Yes, block' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u) === `${BASE}/organizers/org-1/block`);
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body))).toEqual({ reason: 'KYC mismatch' });
    });
    expect(await screen.findByText('Sahyadri Trails blocked')).toBeInTheDocument();
  });

  it('sends people back to sign in when the session is rejected', async () => {
    sessionStorage.setItem(
      'inveon_sa_session',
      JSON.stringify({ token: 'old', email: 'ops@inveon.in', name: 'Ops', expiresAt: Date.now() + 3600_000 }),
    );
    stubFetch((url) => {
      if (url === `${BASE}/ping`) return { body: { ok: true } };
      if (url === `${BASE}/dashboard`) return { status: 401, body: { error: 'Password changed — please sign in again' } };
      return undefined;
    });
    renderAt(`/x/${KEY}/dashboard`);
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(sessionStorage.getItem('inveon_sa_session')).toBeNull();
  });
});

describe('platform branding from the portal', () => {
  beforeEach(() => {
    resetBrandingCache();
    (globalThis as { __brandingInTests?: boolean }).__brandingInTests = true;
  });
  afterEach(() => {
    delete (globalThis as { __brandingInTests?: boolean }).__brandingInTests;
    resetBrandingCache();
    vi.unstubAllGlobals();
  });

  it('shows the uploaded logo in the site header', async () => {
    stubFetch((url) => {
      if (url === '/api/platform/branding')
        return {
          body: {
            platformName: 'Inveon Events',
            logoUrl: '/api/uploads/platform/new-logo.png',
            supportEmail: 'help@inveon.in',
            supportPhone: null,
            primaryColor: '#0050cb',
            companyName: 'Inveon Technologies',
            certificateFooter: {},
          },
        };
      return { body: { events: [] } };
    });
    renderAt('/events');
    const banner = await screen.findByRole('banner');
    await waitFor(() => expect(within(banner).getByAltText('Inveon Events')).toHaveAttribute('src', '/api/uploads/platform/new-logo.png'));
  });
});
