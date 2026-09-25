import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const png = (name) => new File([new Uint8Array(100)], name, { type: 'image/png' });

describe('CreateEvent: ticket design + preview before publish', () => {
  let fetchMock;
  let uploads;

  beforeEach(() => {
    localStorage.setItem(
      'inveon_user',
      JSON.stringify({
        id: 'u1',
        email: 'owner@epc.example',
        role: 'organizer_owner',
        organizerId: 'org-1',
        token: 't',
        name: 'owner',
        isLoggedIn: true,
      }),
    );
    uploads = 0;
    fetchMock = vi.fn().mockImplementation((url, opts) => {
      const u = String(url);
      if (u.includes('/organizer/uploads/image')) {
        uploads += 1;
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ url: `/api/uploads/organizers/org-1/design/img${uploads}.png` }),
        });
      }
      if (u.includes('/organizer/profile')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ name: 'Eco Pandhari Club', logoUrl: null, contactPhone: '0788 750 3856' }),
        });
      }
      if (u.includes('/organizer/events') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-1', slug: 'evt-1' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ counts: {}, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows placeholder partner tiles to the organizer, then the uploaded background and partners, and saves them', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/create-event/preview');

    // Empty design: the organizer sees where logos would go.
    const preview = await screen.findByTestId('desktop-ticket');
    expect(within(preview).getAllByText('Your Logo Here')).toHaveLength(4);
    await waitFor(() => expect(within(preview).getAllByText('Eco Pandhari Club').length).toBeGreaterThan(0));

    await user.upload(screen.getByLabelText('Upload ticket background'), png('bg.png'));
    await waitFor(() =>
      expect(screen.getByAltText('Ticket background')).toHaveAttribute('src', '/api/uploads/organizers/org-1/design/img1.png'),
    );

    await user.click(screen.getByRole('button', { name: /add partner/i }));
    await user.type(screen.getByLabelText('Partner 1 name'), 'EPC Sound');
    await user.type(screen.getByLabelText('Partner 1 role'), 'Music Partner');
    await user.upload(screen.getByLabelText('Upload logo for partner 1'), png('logo.png'));
    await waitFor(() => expect(within(screen.getByTestId('desktop-ticket')).getByAltText('EPC Sound')).toBeInTheDocument());
    expect(within(screen.getByTestId('desktop-ticket')).queryByText('Your Logo Here')).not.toBeInTheDocument();

    // Mobile preview uses the same data.
    await user.click(screen.getByRole('tab', { name: /mobile/i }));
    expect(within(screen.getByTestId('mobile-ticket')).getByAltText('EPC Sound')).toBeInTheDocument();

    await user.click(screen.getByText('Save as Draft'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => String(u).includes('/organizer/events') && o?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(call[1].body);
      expect(body.ticketBackgroundUrl).toBe('/api/uploads/organizers/org-1/design/img1.png');
      expect(body.partners).toEqual([
        { name: 'EPC Sound', role: 'Music Partner', logoUrl: '/api/uploads/organizers/org-1/design/img2.png' },
      ]);
    });
  });

  it('allows at most 10 partners', async () => {
    const user = userEvent.setup();
    renderAt('/organizer/create-event/preview');
    const add = await screen.findByRole('button', { name: /add partner/i });
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await user.click(add);
    }
    expect(screen.getByLabelText('Partner 10 name')).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(screen.getByText('(10/10)')).toBeInTheDocument();
  });
});
