import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import AccountSettings from './pages/settings/AccountSettings';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizer/settings/account']}>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/organizer/settings/account" element={<AccountSettings />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function setLoggedIn() {
  localStorage.setItem(
    'inveon_user',
    JSON.stringify({
      id: 'u1', email: 'owner@example.com', role: 'organizer_owner', organizerId: 'org-1',
      token: 'fake-token', name: 'owner', orgName: null, avatar: 'https://example.com/a.png', isLoggedIn: true,
    }),
  );
}

describe('AccountSettings: real profile data and a real, working logo upload', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('loads and displays the real fetched profile, not mock data', async () => {
    setLoggedIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ name: 'Real Fetched Org Name', contactEmail: 'real@example.com', contactPhone: '+919999999999', about: 'Real fetched bio', logoUrl: null }),
    }));

    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Real Fetched Org Name')).toBeInTheDocument());
    expect(screen.getByDisplayValue('real@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Real fetched bio')).toBeInTheDocument();
  });

  it('a real file selection actually uploads via the real endpoint — the fix for the previously non-functional upload', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/profile/logo')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ logoUrl: 'https://example.com/real-logo.png' }) });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ name: 'Org With No Logo Yet', contactEmail: null, contactPhone: null, about: null, logoUrl: null }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Org With No Logo Yet')).toBeInTheDocument());

    const file = new File(['fake-image-bytes'], 'logo.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    await user.upload(fileInput, file);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/profile/logo'));
      expect(call).toBeTruthy();
    });
    await waitFor(() => expect(screen.getByAltText('Org With No Logo Yet')).toHaveAttribute('src', 'https://example.com/real-logo.png'));
  });

  it('saving actually calls the real PATCH endpoint with the edited fields', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(opts.body) });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ name: 'Original Name', contactEmail: 'orig@example.com', contactPhone: '+911111111111', about: 'Original about', logoUrl: null }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('Original Name')).toBeInTheDocument());

    const nameInput = screen.getByDisplayValue('Original Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Edited Real Name');
    await user.click(screen.getByRole('button', { name: /save profile changes/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
      expect(call).toBeTruthy();
    });
    const [, patchOpts] = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patchOpts.body).name).toBe('Edited Real Name');
  });
});
