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

describe('CreateEvent: the real refund policy the organizer sets actually reaches the backend', () => {
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
    localStorage.removeItem('inveon_events');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('enabling self-service cancellation and setting real values sends the real flat fields, not the old broken nested object', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/organizer/events')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-1', slug: 'test-event' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Org', counts: { all: 0, draft: 0, published: 0, completed: 0, cancelled: 0 }, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/create-event/basic');
    await user.type(screen.getByPlaceholderText(/rajgad sunrise trek/i), 'Policy Test Event');

    // In-app navigation (same mounted CreateEvent component across all 5
    // step routes) so formData actually persists, unlike calling
    // renderAt again, which would mount a fresh instance and lose it.
    await user.click(screen.getByRole('link', { name: /policy & faq/i }));

    const checkbox = await screen.findByRole('checkbox', { name: /allow attendee self-service cancellations/i });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    const cutoffInput = screen.getByLabelText(/refund cutoff/i);
    await user.clear(cutoffInput);
    await user.type(cutoffInput, '5');

    const percentInput = screen.getByLabelText(/refund amount percentage/i);
    await user.clear(percentInput);
    await user.type(percentInput, '90');

    await user.type(screen.getByLabelText(/policy terms description/i), 'Real policy text');

    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
      expect(call).toBeTruthy();
    });
    const [, postOpts] = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
    const body = JSON.parse(postOpts.body);
    expect(body.allowSelfServiceCancellation).toBe(true);
    expect(body.refundCutoffDays).toBe(5);
    expect(body.refundPercentage).toBe(90);
    expect(body.cancellationPolicy).toBe('Real policy text');
  });

  it('leaving the toggle unchecked (the default) sends allowSelfServiceCancellation: false — a real "No Refund" event, not the old default-true nested object nobody read', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/organizer/events')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-2', slug: 'default-policy-event' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Org', counts: { all: 0, draft: 0, published: 0, completed: 0, cancelled: 0 }, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/create-event/basic');
    await user.type(screen.getByPlaceholderText(/rajgad sunrise trek/i), 'Default Policy Event');

    await user.click(screen.getByRole('link', { name: /policy & faq/i }));
    expect(await screen.findByRole('checkbox', { name: /allow attendee self-service cancellations/i })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
      expect(call).toBeTruthy();
    });
    const [, postOpts] = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
    const body = JSON.parse(postOpts.body);
    expect(body.allowSelfServiceCancellation).toBe(false);
  });

  it('setting a real gender restriction sends it in the real create request, and leaving it as "Open to all" sends null', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/organizer/events')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-gender-1', slug: 'gender-event' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Org', counts: { all: 0, draft: 0, published: 0, completed: 0, cancelled: 0 }, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/create-event/basic');
    await user.type(screen.getByPlaceholderText(/rajgad sunrise trek/i), 'Female Only Event');
    await user.selectOptions(screen.getByLabelText(/gender eligibility/i), 'female');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
      expect(call).toBeTruthy();
    });
    const [, postOpts] = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
    expect(JSON.parse(postOpts.body).genderRestriction).toBe('female');
  });

  it('leaving gender eligibility as the default "Open to all" sends null, not an empty string or missing field', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/organizer/events')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'evt-gender-2', slug: 'open-event' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ organizerName: 'Org', counts: { all: 0, draft: 0, published: 0, completed: 0, cancelled: 0 }, events: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/organizer/create-event/basic');
    await user.type(screen.getByPlaceholderText(/rajgad sunrise trek/i), 'Open Event');
    expect(screen.getByLabelText(/gender eligibility/i)).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
      expect(call).toBeTruthy();
    });
    const [, postOpts] = fetchMock.mock.calls.find(([u, o]) => o?.method === 'POST' && String(u).includes('/organizer/events'));
    expect(JSON.parse(postOpts.body).genderRestriction).toBeNull();
  });
});
