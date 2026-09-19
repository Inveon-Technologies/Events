import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderWithState(path, state) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('organizer portal: real forgot-password flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('forgot-password form starts empty and submits the real entered email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'If that email is registered, a verification code has been sent' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithState('/organizer/forgot-password');
    const user = userEvent.setup();

    expect(screen.getByLabelText(/registered email/i)).toHaveValue('');
    await user.type(screen.getByLabelText(/registered email/i), 'real.owner@example.com');
    await user.click(screen.getByRole('button', { name: /send verification/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/forgot-password'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'real.owner@example.com' }) }),
      ),
    );
  });

  it('verify-otp in reset context calls verify-reset-otp (not signup verify) and carries the reset token forward instead of logging in', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ resetToken: 'real-reset-token-abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithState('/organizer/verify-otp', { email: 'real.owner@example.com', context: 'reset' });
    const user = userEvent.setup();

    const digitInputs = screen.getAllByRole('textbox');
    const code = '654321';
    for (let i = 0; i < 6; i += 1) {
      await user.type(digitInputs[i], code[i]);
    }
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/verify-reset-otp'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'real.owner@example.com', code: '654321' }) }),
      ),
    );
    // Landed on the new-password step, not the dashboard — a reset
    // should never log the user straight in.
    await waitFor(() => expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument());
  });

  it('create-new-password submits the real reset token and new password, then lands on login — not the identity/KYC chain', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Password updated' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithState('/organizer/create-new-password', { resetToken: 'real-reset-token-abc' });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^new password/i), 'BrandNewPassword456');
    await user.type(screen.getByLabelText(/confirm new password/i), 'BrandNewPassword456');
    await user.click(screen.getByRole('button', { name: /save.*continue/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/reset-password'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ resetToken: 'real-reset-token-abc', newPassword: 'BrandNewPassword456' }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: /organizer sign in/i })).toBeInTheDocument());
  });
});
