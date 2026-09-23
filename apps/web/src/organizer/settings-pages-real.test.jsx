import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import OrganizationSettings from './pages/settings/OrganizationSettings';
import SecuritySettings from './pages/settings/SecuritySettings';

function renderPage(Component, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            <Route path={path} element={<Component />} />
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

describe('OrganizationSettings: real GSTIN/website/team data, no fake invite system', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('loads and displays the real profile fields and real team roster, not mock data', async () => {
    setLoggedIn();
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/organizer/team')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ team: [{ id: 't1', name: 'Real Team Member', email: 'member@example.com', role: 'organizer_owner', createdAt: '2026-01-01T00:00:00.000Z' }] }),
        });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ name: 'Real Legal Org Name', contactEmail: 'support@example.com', contactPhone: '+919888888888', about: null, logoUrl: null, gstNumber: '27AAAAA0000A1Z5', website: 'https://example.org' }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage(OrganizationSettings, '/organizer/settings/organization');
    await waitFor(() => expect(screen.getByDisplayValue('Real Legal Org Name')).toBeInTheDocument());
    expect(screen.getByDisplayValue('27AAAAA0000A1Z5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.org')).toBeInTheDocument();
    expect(screen.getByText('Real Team Member')).toBeInTheDocument();

    expect(screen.queryByText(/invite member/i)).not.toBeInTheDocument();
  });

  it('saving actually PATCHes the real GSTIN and website fields', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(opts.body) });
      }
      if (String(url).includes('/organizer/team')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ team: [] }) });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ name: 'Org Name', contactEmail: null, contactPhone: null, about: null, logoUrl: null, gstNumber: '', website: '' }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage(OrganizationSettings, '/organizer/settings/organization');
    await waitFor(() => expect(screen.getByDisplayValue('Org Name')).toBeInTheDocument());

    const gstInput = screen.getByLabelText(/GSTIN/i);
    await user.type(gstInput, '29BBBBB1111B1Z6');
    await user.click(screen.getByRole('button', { name: /save organization settings/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
      expect(call).toBeTruthy();
    });
    const [, patchOpts] = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patchOpts.body).gstNumber).toBe('29BBBBB1111B1Z6');
  });
});

describe('SecuritySettings: real change-password, honest handling for 2FA/sessions', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('submitting actually calls the real change-password endpoint with both passwords', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    renderPage(SecuritySettings, '/organizer/settings/security');
    await user.type(screen.getByPlaceholderText('••••••••'), 'MyCurrentPassword123');
    await user.type(screen.getByPlaceholderText(/at least 8 characters/i), 'MyNewPassword123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/change-password'));
      expect(call).toBeTruthy();
    });
    const [, opts] = fetchMock.mock.calls.find(([u]) => String(u).includes('/change-password'));
    expect(JSON.parse(opts.body)).toEqual({ currentPassword: 'MyCurrentPassword123', newPassword: 'MyNewPassword123' });
  });

  it('does not clear the password fields or claim success when the current password is wrong', async () => {
    setLoggedIn();
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Current password is incorrect' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderPage(SecuritySettings, '/organizer/settings/security');
    await user.type(screen.getByPlaceholderText('••••••••'), 'WrongPassword');
    await user.type(screen.getByPlaceholderText(/at least 8 characters/i), 'NewPassword123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/change-password'));
      expect(call).toBeTruthy();
    });
    // The old fake version always showed success and cleared the form regardless
    // of any real outcome — on a real failure, the entered values must remain so
    // the person isn't left thinking a wrong password attempt actually worked.
    expect(screen.getByPlaceholderText('••••••••')).toHaveValue('WrongPassword');
    expect(screen.getByPlaceholderText(/at least 8 characters/i)).toHaveValue('NewPassword123');
  });

  it('shows 2FA and sessions honestly as not available, rather than fake working controls', async () => {
    setLoggedIn();
    renderPage(SecuritySettings, '/organizer/settings/security');
    expect(screen.getAllByText(/not available yet/i).length).toBe(2);
    expect(screen.queryByRole('button', { name: /enable 2fa/i })).not.toBeInTheDocument();
  });
});
