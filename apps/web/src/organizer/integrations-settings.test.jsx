import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderAt(path) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function login(role = 'organizer_owner') {
  localStorage.setItem('inveon_user', JSON.stringify({
    id: 'u1', email: 'owner@example.com', role, organizerId: 'org-1', token: 't', name: 'Owner', orgName: null, avatar: null, isLoggedIn: true,
  }));
}

describe('Settings → Integrations', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('generates a key, shows the secret once, and lists it; revoking removes it', async () => {
    login();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url, init) => {
      const u = String(url);
      calls.push([init?.method ?? 'GET', u]);
      if (u.includes('/integrations/keys') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({
          id: 'k1', name: 'My website', appKey: 'ievt_abc', appSecret: 'isk_supersecret1234', secretLast4: '1234', createdAt: '2026-09-24T10:00:00.000Z', lastUsedAt: null,
        }) });
      }
      if (u.includes('/integrations/keys/k1') && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
      }
      if (u.includes('/integrations/keys')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ keys: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ events: [], counts: {}, bookings: [], pagination: { total: 0 } }) });
    }));

    renderAt('/organizer/settings/integrations');
    await screen.findByText(/No API keys yet/);
    await user.type(screen.getByLabelText('Key name'), 'My website');
    await user.click(screen.getByRole('button', { name: /generate key/i }));

    expect(await screen.findByText('isk_supersecret1234')).toBeInTheDocument();
    expect(screen.getByText(/won.t be shown again/i)).toBeInTheDocument();
    expect(screen.getByText('••••1234')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /i.ve saved it/i }));
    expect(screen.queryByText('isk_supersecret1234')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /revoke/i }));
    await waitFor(() => expect(calls).toContainEqual(['DELETE', expect.stringContaining('/integrations/keys/k1')]));
    await waitFor(() => expect(screen.queryByText('••••1234')).not.toBeInTheDocument());
  });

  it('staff see that only the owner manages keys', async () => {
    login('organizer_staff');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ events: [], counts: {} }) }));
    renderAt('/organizer/settings/integrations');
    expect(await screen.findByText(/Only the account owner/)).toBeInTheDocument();
  });
});
