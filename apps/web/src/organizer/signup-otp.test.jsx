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

describe('organizer portal: real signup + OTP verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('signup form starts empty (not pre-filled with a fake demo persona) and submits real entered values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ message: 'Verification code sent', email: 'real.user@example.com' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/signup');
    const user = userEvent.setup();

    expect(screen.getByLabelText(/full name/i)).toHaveValue('');
    expect(screen.getByLabelText(/organization.*brand name/i)).toHaveValue('');

    await user.type(screen.getByLabelText(/full name/i), 'Real Test User');
    await user.type(screen.getByLabelText(/official email/i), 'real.user@example.com');
    await user.type(screen.getByLabelText(/phone/i), '+919876543210');
    await user.type(screen.getByLabelText(/organization.*brand name/i), 'Real Test Org');
    await user.type(screen.getByLabelText(/^password/i), 'RealPassword123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /continue to verification/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/signup'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            fullName: 'Real Test User',
            email: 'real.user@example.com',
            phone: '+919876543210',
            orgName: 'Real Test Org',
            password: 'RealPassword123',
          }),
        }),
      ),
    );
  });

  it('shows the real error when signup fails (email already in use) instead of silently succeeding', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'An account with this email already exists' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/signup');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/full name/i), 'Someone');
    await user.type(screen.getByLabelText(/official email/i), 'taken@example.com');
    await user.type(screen.getByLabelText(/phone/i), '+919876543210');
    await user.type(screen.getByLabelText(/organization.*brand name/i), 'Org');
    await user.type(screen.getByLabelText(/^password/i), 'Password123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /continue to verification/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i));
  });

  it('verify-otp in signup context submits the real code and logs the user in on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'real-jwt-token',
        user: { id: 'u1', email: 'real.user@example.com', role: 'organizer_owner', organizerId: 'org-1' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[{ pathname: '/organizer/verify-otp', state: { email: 'real.user@example.com', context: 'signup' } }]}
        >
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();

    expect(screen.getByText('real.user@example.com')).toBeInTheDocument();

    const digitInputs = screen.getAllByRole('textbox');
    const code = '123456';
    for (let i = 0; i < 6; i += 1) {
      await user.type(digitInputs[i], code[i]);
    }
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/verify-otp'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'real.user@example.com', code: '123456' }) }),
      ),
    );

    // Real login on success — the dashboard's own real-data fetch (not
    // mocked further here) means we just confirm navigation happened by
    // checking the login/signup form is no longer showing.
    await waitFor(() => expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument());
  });
});
