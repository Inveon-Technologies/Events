import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderAt(path, initialState) {
  const queryClient = new QueryClient();
  const entries = initialState ? [{ pathname: path, state: initialState }] : [path];
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={entries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('organizer verification: identity + bank details', () => {
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

  it('VerifyIdentity rejects an invalid PAN and never navigates forward', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/verify-identity');

    await user.type(screen.getByPlaceholderText('ABCDE1234F'), 'not-a-pan');
    await user.type(screen.getByPlaceholderText('+91 98765 43210'), '9000000001');
    await user.click(screen.getByRole('button', { name: /continue to bank details/i }));

    expect(screen.getByText(/enter a valid pan number/i)).toBeInTheDocument();
    // Still on the identity step, not navigated to bank details.
    expect(screen.getByRole('heading', { name: /organizer identity verification/i })).toBeInTheDocument();
  });

  it('VerifyIdentity navigates forward to CompleteSetup with the entered data on valid input', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/verify-identity');

    await user.type(screen.getByPlaceholderText('ABCDE1234F'), 'abcde1234f');
    await user.type(screen.getByPlaceholderText('+91 98765 43210'), '9000000001');
    await user.click(screen.getByRole('button', { name: /continue to bank details/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /complete organization setup/i })).toBeInTheDocument());
  });

  it('CompleteSetup redirects back to VerifyIdentity when reached directly with no KYC state', async () => {
    renderAt('/organizer/complete-setup');
    await waitFor(() => expect(screen.getByRole('heading', { name: /organizer identity verification/i })).toBeInTheDocument());
  });

  it('CompleteSetup submits the real combined KYC + bank request and redirects to the dashboard on success', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/organizer/verification') && !urlStr.includes('dashboard')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ cashfreeVendorStatus: 'in_bene_creation' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Eco Pandhari Club', counts: {}, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderAt('/organizer/complete-setup', {
      panNumber: 'ABCDE1234F',
      accountType: 'individual',
      businessType: '',
      contactPhone: '+919000000001',
    });

    await user.type(screen.getByPlaceholderText(/as it appears on your bank account/i), 'Test Owner');
    await user.type(screen.getByPlaceholderText(/50200089214912/), '123456789012');
    await user.type(screen.getByPlaceholderText(/hdfc0000123/i), 'hdfc0001234');
    await user.click(screen.getByRole('button', { name: /submit for verification/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/organizer/verification'));
      expect(call).toBeTruthy();
    });
    const [, opts] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/organizer/verification'));
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      panNumber: 'ABCDE1234F',
      accountType: 'individual',
      businessType: undefined,
      contactPhone: '+919000000001',
      bankAccountHolderName: 'Test Owner',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
    });
    expect(opts.headers.Authorization).toBe('Bearer fake-token');
  });

  it('CompleteSetup shows the real server error and does not navigate away on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Enter a valid bank IFSC code' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderAt('/organizer/complete-setup', {
      panNumber: 'ABCDE1234F',
      accountType: 'individual',
      businessType: '',
      contactPhone: '+919000000001',
    });

    await user.type(screen.getByPlaceholderText(/as it appears on your bank account/i), 'Test Owner');
    await user.type(screen.getByPlaceholderText(/50200089214912/), '123456789012');
    await user.type(screen.getByPlaceholderText(/hdfc0000123/i), 'hdfc0001234');
    await user.click(screen.getByRole('button', { name: /submit for verification/i }));

    await waitFor(() => expect(screen.getByText('Enter a valid bank IFSC code')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /complete organization setup/i })).toBeInTheDocument();
  });

  it('Settings > Payment Verification shows "Not started" and a real entry point when nothing has been submitted yet — the gap that previously left existing accounts with no way to reach verification at all', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cashfreeVendorStatus: 'not_started',
        panNumber: null,
        kycAccountType: null,
        businessType: null,
        bankAccountHolderName: null,
        bankAccountNumberLast4: null,
        bankIfsc: null,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderAt('/organizer/settings/verification');

    await waitFor(() => expect(screen.getByText('Not started')).toBeInTheDocument());
    expect(screen.getByText(/haven't submitted your kyc/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start verification/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /organizer identity verification/i })).toBeInTheDocument());

    vi.unstubAllGlobals();
  });

  it('Settings > Payment Verification shows the real submitted details and status once verification has been started', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cashfreeVendorStatus: 'in_bene_creation',
        panNumber: 'ABCDE1234F',
        kycAccountType: 'individual',
        businessType: null,
        bankAccountHolderName: 'Real Test Owner',
        bankAccountNumberLast4: '9012',
        bankIfsc: 'HDFC0001234',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/settings/verification');

    await waitFor(() => expect(screen.getByText('Verification in progress')).toBeInTheDocument());
    expect(screen.getByText('ABCDE1234F')).toBeInTheDocument();
    expect(screen.getByText('Real Test Owner')).toBeInTheDocument();
    expect(screen.getByText('•••• 9012')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('Settings > Payment Verification refresh button calls the real refresh endpoint and reloads the status', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (String(url).endsWith('/verification/refresh')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ cashfreeVendorStatus: 'active' }) });
      }
      callCount += 1;
      const status = callCount === 1 ? 'in_bene_creation' : 'active';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          cashfreeVendorStatus: status,
          panNumber: 'ABCDE1234F',
          kycAccountType: 'individual',
          businessType: null,
          bankAccountHolderName: 'Real Test Owner',
          bankAccountNumberLast4: '9012',
          bankIfsc: 'HDFC0001234',
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderAt('/organizer/settings/verification');
    await waitFor(() => expect(screen.getByText('Verification in progress')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /refresh status/i }));
    await waitFor(() => expect(screen.getByText('Verified')).toBeInTheDocument());

    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/verification/refresh'))).toBe(true);

    vi.unstubAllGlobals();
  });
});
